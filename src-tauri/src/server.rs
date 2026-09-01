use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use std::process::Stdio;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::sync::Mutex;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::admission::AdmissionGate;
use crate::peer_store::PeerStore;
use crate::transport;
use crate::client::{HttpProxyRequest, HttpProxyResponseChunk};

#[derive(Debug, Error)]
pub enum ServerError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Server is already running")]
    AlreadyRunning,
    #[error("Transport error: {0}")]
    Transport(String),
}

#[derive(Serialize, Clone, Debug)]
pub struct SessionInfo {
    pub peer_id: String,
    pub device_name: String,
    pub connected_at: String,
    pub active: bool,
}

pub struct HostServer {
    listener_task: Option<tokio::task::JoinHandle<()>>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    sessions: Arc<Mutex<HashMap<String, SessionInfo>>>,
    session_kills: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
    cloudflared_process: Option<tokio::process::Child>,
}

impl HostServer {
    pub fn new() -> Self {
        Self {
            listener_task: None,
            shutdown_tx: None,
            sessions: Arc::new(Mutex::new(HashMap::new())),
            session_kills: Arc::new(Mutex::new(HashMap::new())),
            cloudflared_process: None,
        }
    }

    pub async fn start(
        &mut self,
        identity_noise_priv: [u8; 32],
        port: u16,
        peer_store: Arc<Mutex<PeerStore>>,
        cf_token: Option<String>,
        admission_gate: Arc<AdmissionGate>,
        app_handle: tauri::AppHandle,
    ) -> Result<(), ServerError> {
        if self.listener_task.is_some() {
            return Err(ServerError::AlreadyRunning);
        }

        let listener = TcpListener::bind(("0.0.0.0", port)).await?;
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        let sessions = self.sessions.clone();
        let session_kills = self.session_kills.clone();

        let app_handle_clone = app_handle.clone();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    accept_res = listener.accept() => {
                        if let Ok((socket, addr)) = accept_res {
                            let noise_priv = identity_noise_priv;
                            let store = peer_store.clone();
                            let sessions = sessions.clone();
                            let session_kills = session_kills.clone();
                            let admission_gate = admission_gate.clone();
                            let app_handle = app_handle_clone.clone();

                            tokio::spawn(async move {
                                match tokio_tungstenite::accept_async(socket).await {
                                    Ok(ws_stream) => {
                                        use futures_util::StreamExt;
                                        let (tx, rx) = ws_stream.split();
                                        let tx: crate::transport::BoxSink = Box::new(tx);
                                        let rx: crate::transport::BoxStream = Box::new(rx);

                                        match transport::handshake_as_responder(tx, rx, &noise_priv).await {
                                            Ok(mut session) => {
                                                let peer_id = session.peer_id().to_string();
                                                let mut is_trusted = {
                                                    let store = store.lock().await;
                                                    store.is_trusted(&peer_id).unwrap_or(false)
                                                };

                                                let info = SessionInfo {
                                                    peer_id: peer_id.clone(),
                                                    device_name: addr.to_string(),
                                                    connected_at: chrono::Utc::now().to_rfc3339(),
                                                    active: true,
                                                };
                                                sessions.lock().await.insert(peer_id.clone(), info);

                                                let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel();
                                                session_kills.lock().await.insert(peer_id.clone(), kill_tx);

                                                log::info!("Session established with {}", peer_id);

                                                let (tx_out, mut rx_out) = tokio::sync::mpsc::channel::<Vec<u8>>(100);
                                                
                                                // We need to allow multiple tasks to write to the session, 
                                                // so we spawn a single loop for the session.
                                                // However, session takes exclusive access for recv() and send().
                                                // Since `session` is currently one object, we can only safely multiplex writes
                                                // if we split it. But we cannot split `session`.
                                                // So we will select over session.recv() and rx_out.recv().
                                                
                                                loop {
                                                    tokio::select! {
                                                        _ = &mut kill_rx => {
                                                            log::info!("Session {} killed", peer_id);
                                                            break;
                                                        }
                                                        out_msg = rx_out.recv() => {
                                                            if let Some(msg) = out_msg {
                                                                let _ = session.send(&msg).await;
                                                            }
                                                        }
                                                        recv_res = session.recv() => {
                                                            match recv_res {
                                                                Ok(payload) => {
                                                                    if let Err(e) = admission_gate.check_payload_size(payload.len()) {
                                                                        let _ = tx_out.send(format!("{{\"error\": \"{}\", \"done\": true}}", e).into_bytes()).await;
                                                                        continue;
                                                                    }

                                                                    let permit = match admission_gate.acquire().await {
                                                                        Ok(p) => p,
                                                                        Err(e) => {
                                                                            let _ = tx_out.send(format!("{{\"error\": \"{}\", \"done\": true}}", e).into_bytes()).await;
                                                                            continue;
                                                                        }
                                                                    };

                                                                    if let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&payload) {
                                                                        use tauri::Manager;
                                                                        use tauri::Emitter;
                                                                        let app_state = app_handle.state::<crate::AppState>();
                                                                        
                                                                        let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");

                                                                        if action == "pair" {
                                                                            if is_trusted {
                                                                                let _ = tx_out.send(b"{\"action\":\"pair_ok\",\"done\":true}".to_vec()).await;
                                                                                continue;
                                                                            }

                                                                            let mut code_matched = false;
                                                                            if let Some(code) = parsed.get("code").and_then(|v| v.as_str()) {
                                                                                let pcode = app_state.pairing_code.lock().await;
                                                                                if let Some(ref pc) = *pcode {
                                                                                    if pc.code == code {
                                                                                        code_matched = true;
                                                                                    }
                                                                                }
                                                                            }
                                                                            if let Some(token) = parsed.get("token").and_then(|v| v.as_str()) {
                                                                                let plink = app_state.pairing_link.lock().await;
                                                                                if let Some(ref pl) = *plink {
                                                                                    if pl.token == token {
                                                                                        code_matched = true;
                                                                                    }
                                                                                }
                                                                            }

                                                                            if code_matched {
                                                                                let store = store.lock().await;
                                                                                let _ = store.add_peer(&peer_id, &addr.to_string(), &peer_id);
                                                                                is_trusted = true;
                                                                                let mut ps = app_state.pairing_state.lock().await;
                                                                                *ps = crate::pairing::PairingState::Completed { peer_id: peer_id.clone() };
                                                                                let _ = tx_out.send(b"{\"action\":\"pair_ok\",\"done\":true}".to_vec()).await;
                                                                                let _ = app_handle.emit("pairing-state-changed", ());
                                                                            } else {
                                                                                // SAS flow
                                                                                let sas = crate::transport::compute_sas(&peer_id, &app_state.identity.peer_id());
                                                                                let mut ps = app_state.pairing_state.lock().await;
                                                                                *ps = crate::pairing::PairingState::AwaitingConfirmation {
                                                                                    sas: sas.clone(),
                                                                                    peer_id: peer_id.clone(),
                                                                                    device_name: addr.to_string(),
                                                                                };
                                                                                let resp = serde_json::json!({
                                                                                    "action": "pair_sas",
                                                                                    "sas": sas
                                                                                });
                                                                                let _ = tx_out.send(serde_json::to_vec(&resp).unwrap()).await;
                                                                                let _ = app_handle.emit("pairing-state-changed", ());

                                                                                // Wait for host user to confirm via pairing_state changes
                                                                                drop(ps);

                                                                                // Spawn a task to wait for confirmation to avoid blocking the read loop
                                                                                let tx_out_clone = tx_out.clone();
                                                                                let peer_id_clone = peer_id.clone();
                                                                                let pairing_state_clone = app_state.pairing_state.clone();
                                                                                tokio::spawn(async move {
                                                                                    let mut confirmed = false;
                                                                                    for _ in 0..60 {
                                                                                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                                                                                        let ps = pairing_state_clone.lock().await;
                                                                                        match &*ps {
                                                                                            crate::pairing::PairingState::Completed { peer_id: pid } if pid == &peer_id_clone => {
                                                                                                confirmed = true;
                                                                                                break;
                                                                                            }
                                                                                            crate::pairing::PairingState::Failed { .. } => break,
                                                                                            _ => {}
                                                                                        }
                                                                                    }
                                                                                    if confirmed {
                                                                                        let _ = tx_out_clone.send(b"{\"action\":\"pair_ok\",\"done\":true}".to_vec()).await;
                                                                                    } else {
                                                                                        let _ = tx_out_clone.send(b"{\"error\":\"Pairing rejected or timed out\",\"done\":true}".to_vec()).await;
                                                                                    }
                                                                                });
                                                                            }
                                                                            continue;
                                                                        }

                                                                        if !is_trusted {
                                                                            log::warn!("Rejected untrusted peer message from: {}", peer_id);
                                                                            let _ = tx_out.send(b"{\"error\":\"Not paired\",\"done\":true}".to_vec()).await;
                                                                            break;
                                                                        }

                                                                        if action == "http_proxy" {
                                                                            if let Ok(proxy_req) = serde_json::from_value::<HttpProxyRequest>(parsed) {
                                                                                let tx_out_clone = tx_out.clone();
                                                                                tokio::spawn(async move {
                                                                                    let local_url = format!("http://127.0.0.1:11434{}", proxy_req.path);
                                                                                    let client = reqwest::Client::new();
                                                                                    
                                                                                    let mut req_builder = client.request(
                                                                                        reqwest::Method::from_bytes(proxy_req.method.as_bytes()).unwrap_or(reqwest::Method::GET),
                                                                                        &local_url
                                                                                    );
                                                                                    
                                                                                    for (k, v) in &proxy_req.headers {
                                                                                        req_builder = req_builder.header(k, v);
                                                                                    }
                                                                                    
                                                                                    if let Some(b64) = proxy_req.body_base64 {
                                                                                        if let Ok(bytes) = BASE64.decode(b64) {
                                                                                            req_builder = req_builder.body(bytes);
                                                                                        }
                                                                                    }
                                                                                    
                                                                                    match req_builder.send().await {
                                                                                        Ok(mut res) => {
                                                                                            let status_code = res.status().as_u16();
                                                                                            let mut headers_vec = Vec::new();
                                                                                            for (name, value) in res.headers() {
                                                                                                if let Ok(v) = value.to_str() {
                                                                                                    headers_vec.push((name.to_string(), v.to_string()));
                                                                                                }
                                                                                            }
                                                                                            
                                                                                            let mut is_first = true;
                                                                                            
                                                                                            while let Ok(Some(chunk)) = res.chunk().await {
                                                                                                let mut response_chunk = HttpProxyResponseChunk {
                                                                                                    action: "http_proxy_chunk".to_string(),
                                                                                                    req_id: proxy_req.req_id.clone(),
                                                                                                    status_code: None,
                                                                                                    headers: None,
                                                                                                    data_base64: Some(BASE64.encode(&chunk)),
                                                                                                    done: false,
                                                                                                };
                                                                                                if is_first {
                                                                                                    response_chunk.status_code = Some(status_code);
                                                                                                    response_chunk.headers = Some(headers_vec.clone());
                                                                                                    is_first = false;
                                                                                                }
                                                                                                if let Ok(bytes) = serde_json::to_vec(&response_chunk) {
                                                                                                    if tx_out_clone.send(bytes).await.is_err() {
                                                                                                        break;
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                            
                                                                                            // Send done marker
                                                                                            let mut done_chunk = HttpProxyResponseChunk {
                                                                                                action: "http_proxy_chunk".to_string(),
                                                                                                req_id: proxy_req.req_id.clone(),
                                                                                                status_code: None,
                                                                                                headers: None,
                                                                                                data_base64: None,
                                                                                                done: true,
                                                                                            };
                                                                                            if is_first {
                                                                                                done_chunk.status_code = Some(status_code);
                                                                                                done_chunk.headers = Some(headers_vec);
                                                                                            }
                                                                                            if let Ok(bytes) = serde_json::to_vec(&done_chunk) {
                                                                                                let _ = tx_out_clone.send(bytes).await;
                                                                                            }
                                                                                        }
                                                                                        Err(e) => {
                                                                                            log::error!("Error proxying request to local ollama: {}", e);
                                                                                            let err_chunk = HttpProxyResponseChunk {
                                                                                                action: "http_proxy_chunk".to_string(),
                                                                                                req_id: proxy_req.req_id,
                                                                                                status_code: Some(502),
                                                                                                headers: None,
                                                                                                data_base64: None,
                                                                                                done: true,
                                                                                            };
                                                                                            if let Ok(bytes) = serde_json::to_vec(&err_chunk) {
                                                                                                let _ = tx_out_clone.send(bytes).await;
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                });
                                                                            }
                                                                        }
                                                                    }
                                                                    drop(permit);
                                                                }
                                                                Err(_) => break,
                                                            }
                                                        }
                                                    }
                                                }
                                                sessions.lock().await.remove(&peer_id);
                                                session_kills.lock().await.remove(&peer_id);
                                            }
                                            Err(e) => {
                                                log::warn!("Handshake failed from {}: {}", addr, e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::warn!("WebSocket upgrade failed from {}: {}", addr, e);
                                    }
                                }
                            });
                        }
                    }
                }
            }
        });

        self.listener_task = Some(task);
        self.shutdown_tx = Some(shutdown_tx);

        if let Some(token) = cf_token {
            if !token.trim().is_empty() {
                log::info!("Ensuring cloudflared binary is available...");

                // Get the local binary path, downloading if necessary
                let cf_bin = crate::cloudflared_manager::ensure_cloudflared(&app_handle)
                    .await
                    .map_err(|e| ServerError::Io(std::io::Error::other(e)))?;

                log::info!("Spawning cloudflared tunnel using {:?}", cf_bin);
                match Command::new(&cf_bin)
                    .arg("tunnel")
                    .arg("--no-autoupdate")
                    .arg("run")
                    .arg("--token")
                    .arg(token)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        self.cloudflared_process = Some(child);
                        log::info!("Cloudflared tunnel spawned successfully.");
                    }
                    Err(e) => {
                        log::error!("Failed to spawn cloudflared: {}", e);
                    }
                }
            }
        }

        Ok(())
    }

    pub async fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.listener_task.take() {
            let _ = task.await;
        }
        if let Some(mut child) = self.cloudflared_process.take() {
            log::info!("Killing cloudflared process...");
            let _ = child.kill().await;
        }
        self.sessions.lock().await.clear();
        self.session_kills.lock().await.clear();
    }

    pub async fn kill_session(&self, peer_id: &str) {
        if let Some(tx) = self.session_kills.lock().await.remove(peer_id) {
            let _ = tx.send(());
        }
    }

    pub fn get_sessions(&self) -> Vec<SessionInfo> {
        match self.sessions.try_lock() {
            Ok(sessions) => sessions.values().cloned().collect(),
            Err(_) => Vec::new(),
        }
    }
}
