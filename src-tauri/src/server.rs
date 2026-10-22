use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use std::process::Stdio;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::sync::Mutex;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::Emitter;

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
                                let mut peek_buf = [0u8; 4096];
                                let mut n = 0;
                                let start_peek = tokio::time::Instant::now();
                                while start_peek.elapsed() < Duration::from_millis(500) {
                                    match socket.peek(&mut peek_buf).await {
                                        Ok(read_n) => {
                                            n = read_n;
                                            let peek_slice = &peek_buf[..n];
                                            if peek_slice.windows(4).any(|w| w == b"\r\n\r\n") || peek_slice.windows(2).any(|w| w == b"\n\n") {
                                                break;
                                            }
                                            if n == 0 {
                                                break;
                                            }
                                            tokio::time::sleep(Duration::from_millis(10)).await;
                                        }
                                        Err(e) => {
                                            log::debug!("Peek error from {}: {}", addr, e);
                                            return;
                                        }
                                    }
                                }

                                if n == 0 {
                                    return;
                                }

                                let peek_str = String::from_utf8_lossy(&peek_buf[..n]);
                                let lower = peek_str.to_ascii_lowercase();
                                let is_ws = lower.contains("upgrade: websocket")
                                    || (lower.contains("upgrade") && lower.contains("websocket"))
                                    || lower.contains("sec-websocket-key");

                                if !is_ws && (peek_str.starts_with("GET ") || peek_str.starts_with("HEAD ") || peek_str.starts_with("OPTIONS ") || peek_str.starts_with("POST ")) {
                                    handle_browser_http_request(socket, addr, &peek_str).await;
                                    return;
                                }

                                match tokio_tungstenite::accept_async(socket).await {
                                    Ok(ws_stream) => {
                                        use futures_util::StreamExt;
                                        let (tx, rx) = ws_stream.split();
                                        let tx: crate::transport::BoxSink = Box::new(tx);
                                        let rx: crate::transport::BoxStream = Box::new(rx);

                                        let handshake_timeout = tokio::time::timeout(
                                            Duration::from_secs(15),
                                            transport::handshake_as_responder(tx, rx, &noise_priv),
                                        ).await;

                                        match handshake_timeout {
                                            Ok(Ok(mut session)) => {
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
                                                let _ = app_handle.emit("sessions-changed", ());

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
                                                                                    if pc.code == code && chrono::Utc::now() < pc.expires_at {
                                                                                        code_matched = true;
                                                                                    }
                                                                                }
                                                                            }
                                                                            if let Some(token) = parsed.get("token").and_then(|v| v.as_str()) {
                                                                                let plink = app_state.pairing_link.lock().await;
                                                                                if let Some(ref pl) = *plink {
                                                                                    if pl.token == token && chrono::Utc::now() < pl.expires_at {
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

                                                                        if action == "pair_confirm" {
                                                                            let confirmed = parsed.get("confirmed").and_then(|v| v.as_bool()).unwrap_or(false);
                                                                            if confirmed {
                                                                                let store = store.lock().await;
                                                                                let _ = store.add_peer(&peer_id, &addr.to_string(), &peer_id);
                                                                                is_trusted = true;
                                                                                let mut ps = app_state.pairing_state.lock().await;
                                                                                *ps = crate::pairing::PairingState::Completed { peer_id: peer_id.clone() };
                                                                                let _ = tx_out.send(b"{\"action\":\"pair_ok\",\"done\":true}".to_vec()).await;
                                                                                let _ = app_handle.emit("pairing-state-changed", ());
                                                                                log::info!("[Server] Peer {} confirmed pairing from client side! Trusted.", peer_id);
                                                                            }
                                                                            continue;
                                                                        }

                                                                        if !is_trusted {
                                                                            let store_guard = store.lock().await;
                                                                            if store_guard.is_trusted(&peer_id).unwrap_or(false) {
                                                                                is_trusted = true;
                                                                            }
                                                                        }

                                                                        if !is_trusted {
                                                                            log::warn!("Rejected untrusted peer message from: {}", peer_id);
                                                                            let _ = tx_out.send(b"{\"error\":\"Not paired\",\"done\":true}".to_vec()).await;
                                                                            break;
                                                                        }
                                                                        if action == "get_sys_stats" {
                                                                            let stats = crate::sys_monitor::get_system_stats();
                                                                            if let Ok(json) = serde_json::to_vec(&serde_json::json!({
                                                                                "action": "sys_stats_response",
                                                                                "data": stats
                                                                            })) {
                                                                                let _ = tx_out.send(json).await;
                                                                            }
                                                                            continue;
                                                                        }

                                                                        if action == "http_proxy" {
                                                                            if let Ok(proxy_req) = serde_json::from_value::<HttpProxyRequest>(parsed) {
                                                                                let tx_out_clone = tx_out.clone();
                                                                                let owned_permit = admission_gate.acquire_owned().await.ok();
                                                                                tokio::spawn(async move {
                                                                                    let _held_permit = owned_permit;
                                                                                    let target_url = format!("http://127.0.0.1:11434{}", proxy_req.path);
                                                                                
                                                                                let client = reqwest::Client::new();
                                                                                let mut req_builder = client.request(
                                                                                    reqwest::Method::from_bytes(proxy_req.method.as_bytes()).unwrap_or(reqwest::Method::GET),
                                                                                    &target_url
                                                                                );
                                                                                
                                                                                for (k, v) in &proxy_req.headers {
                                                                                    let kl = k.to_lowercase();
                                                                                    if kl != "host" && kl != "content-length" && kl != "connection" && kl != "transfer-encoding" {
                                                                                        req_builder = req_builder.header(k, v);
                                                                                    }
                                                                                }
                                                                                
                                                                                if let Some(ref b64) = proxy_req.body_base64 {
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
                                                                }
                                                                Err(_) => break,
                                                            }
                                                        }
                                                    }
                                                }
                                                sessions.lock().await.remove(&peer_id);
                                                let _ = app_handle.emit("sessions-changed", ());
                                                session_kills.lock().await.remove(&peer_id);
                                            }
                                            Ok(Err(e)) => {
                                                log::warn!("Handshake failed from {}: {}", addr, e);
                                            }
                                            Err(_) => {
                                                log::warn!("Handshake timed out (15s) from {}", addr);
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

        if let Err(e) = self.spawn_tunnel(port, cf_token, &app_handle).await {
            log::warn!("Could not spawn tunnel during host start: {}", e);
        }

        Ok(())
    }

    pub async fn spawn_tunnel(
        &mut self,
        port: u16,
        cf_token: Option<String>,
        app_handle: &tauri::AppHandle,
    ) -> Result<(), String> {
        // Kill existing tunnel if one is running
        if let Some(mut child) = self.cloudflared_process.take() {
            log::info!("Terminating existing cloudflared process before respawn...");
            let _ = child.kill().await;
        }

        // Ensure cloudflared binary is available
        let cf_bin = crate::cloudflared_manager::ensure_cloudflared(app_handle)
            .await
            .map_err(|e| format!("Failed to find or download cloudflared: {}", e))?;

        let mut cmd = Command::new(&cf_bin);

        if let Some(token) = cf_token {
            if !token.trim().is_empty() {
                log::info!("Spawning managed token tunnel via {:?}", cf_bin);
                cmd.arg("tunnel")
                    .arg("--no-autoupdate")
                    .arg("run")
                    .arg("--token")
                    .arg(token);
            } else {
                log::info!("Spawning zero-config quick tunnel for port {}...", port);
                cmd.arg("tunnel")
                    .arg("--no-autoupdate")
                    .arg("--url")
                    .arg(format!("http://127.0.0.1:{}", port));
            }
        } else {
            log::info!("Spawning zero-config quick tunnel for port {}...", port);
            cmd.arg("tunnel")
                .arg("--no-autoupdate")
                .arg("--url")
                .arg(format!("http://127.0.0.1:{}", port));
        }

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn cloudflared: {}", e))?;

        let (tx_line, mut rx_line) = tokio::sync::mpsc::channel::<String>(100);

        if let Some(stdout) = child.stdout.take() {
            let tx = tx_line.clone();
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send(line).await;
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let tx = tx_line.clone();
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send(line).await;
                }
            });
        }

        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            use tauri::Manager;
            while let Some(line) = rx_line.recv().await {
                if line.contains(".trycloudflare.com") {
                    for raw_word in line.split_whitespace() {
                        let word = raw_word.trim_matches(|c| c == '|' || c == ' ' || c == '\t' || c == ',' || c == '"' || c == '\'');
                        if word.starts_with("https://") && word.contains(".trycloudflare.com") {
                            log::info!("[Tunnel] Extracted free Cloudflare quick tunnel URL: {}", word);
                            let _ = app_handle_clone.emit("tunnel-url-ready", word.to_string());
                            if let Some(app_state) = app_handle_clone.try_state::<crate::AppState>() {
                                let mut tunnel_lock = app_state.active_tunnel_url.lock().await;
                                *tunnel_lock = Some(word.to_string());
                            }
                            break;
                        }
                    }
                } else if line.contains("Tunnelstore request failed") || line.contains("provisioning failed") {
                    log::warn!("[Tunnel] Cloudflare rate limit or provisioning failure: {}", line);
                    let _ = app_handle_clone.emit("tunnel-error", "Cloudflare Quick Tunnel busy or provisioning rate-limited. Click 'Restart Tunnel' to retry.");
                }
            }

            // Stream closed: cloudflared terminated or went down
            log::info!("[Tunnel] Cloudflared process stream closed. Tunnel is down.");
            if let Some(app_state) = app_handle_clone.try_state::<crate::AppState>() {
                let mut tunnel_lock = app_state.active_tunnel_url.lock().await;
                *tunnel_lock = None;
            }
            let _ = app_handle_clone.emit("tunnel-url-cleared", ());
            let _ = app_handle_clone.emit("tunnel-url-ready", "");
        });

        self.cloudflared_process = Some(child);
        log::info!("Cloudflared tunnel spawned successfully.");
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

    pub fn is_running(&self) -> bool {
        self.listener_task.is_some()
    }
}

async fn handle_browser_http_request(mut socket: tokio::net::TcpStream, addr: std::net::SocketAddr, request_str: &str) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // Drain the incoming HTTP request body/headers from the socket buffer so HTTP/1.1 completes cleanly
    let mut drain_buf = [0u8; 4096];
    let _ = socket.read(&mut drain_buf).await;

    let first_line = request_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let method = parts.get(0).copied().unwrap_or("GET");
    let path = parts.get(1).copied().unwrap_or("/");

    log::info!("Browser HTTP request from {}: {} {}", addr, method, path);

    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
        let _ = socket.write_all(resp.as_bytes()).await;
        let _ = socket.flush().await;
        let _ = socket.shutdown().await;
        return;
    }

    if path == "/health" || path == "/api/health" {
        let body = r#"{"status":"online","service":"ghostcompute","protocol":"noise_xx"}"#;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = socket.write_all(resp.as_bytes()).await;
        let _ = socket.flush().await;
        let _ = socket.shutdown().await;
        return;
    }

    let token = if let Some(query_start) = path.find('?') {
        let query = &path[query_start + 1..];
        query.split('&')
            .find_map(|pair| {
                let mut kv = pair.split('=');
                if kv.next() == Some("token") {
                    kv.next().map(|v| v.to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    let token_json = serde_json::to_string(&token.as_deref().unwrap_or("")).unwrap_or_else(|_| "\"\"".to_string());

    const HTML_TEMPLATE: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>GhostCompute &middot; Zero-Trust Distributed AI Gateway</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%0A%20%20%3Cstyle%3E%0A%20%20%20%20%40keyframes%20gc-float%20%7B%0A%20%20%20%20%20%200%25%2C%20100%25%20%7B%20transform%3A%20translateY%280px%29%3B%20%7D%0A%20%20%20%20%20%2050%25%20%7B%20transform%3A%20translateY%28-1.5px%29%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20%40keyframes%20gc-sparkle%20%7B%0A%20%20%20%20%20%200%25%2C%20100%25%20%7B%20opacity%3A%200.4%3B%20transform%3A%20scale%280.8%29%20translate%280%2C%200%29%3B%20%7D%0A%20%20%20%20%20%2050%25%20%7B%20opacity%3A%200.9%3B%20transform%3A%20scale%281.2%29%20translate%280%2C%20-1px%29%3B%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20.gc-ghost-body%20%7B%0A%20%20%20%20%20%20animation%3A%20gc-float%204s%20ease-in-out%20infinite%3B%0A%20%20%20%20%20%20transform-origin%3A%20center%3B%0A%20%20%20%20%20%20color%3A%20%238B5CF6%3B%0A%20%20%20%20%7D%0A%20%20%20%20.gc-sparkle-1%20%7B%0A%20%20%20%20%20%20animation%3A%20gc-sparkle%203s%20ease-in-out%20infinite%3B%0A%20%20%20%20%20%20transform-origin%3A%202px%207px%3B%0A%20%20%20%20%20%20color%3A%20%238B5CF6%3B%0A%20%20%20%20%7D%0A%20%20%20%20.gc-sparkle-2%20%7B%0A%20%20%20%20%20%20animation%3A%20gc-sparkle%203s%20ease-in-out%20infinite%201s%3B%0A%20%20%20%20%20%20transform-origin%3A%2022px%2015px%3B%0A%20%20%20%20%20%20color%3A%20%238B5CF6%3B%0A%20%20%20%20%7D%0A%20%20%20%20.gc-sparkle-3%20%7B%0A%20%20%20%20%20%20animation%3A%20gc-sparkle%203s%20ease-in-out%20infinite%202s%3B%0A%20%20%20%20%20%20transform-origin%3A%2020px%205px%3B%0A%20%20%20%20%20%20color%3A%20%238B5CF6%3B%0A%20%20%20%20%7D%0A%20%20%3C/style%3E%0A%20%20%0A%20%20%3Cg%20class%3D%22gc-ghost-body%22%3E%0A%20%20%20%20%3C%21--%20Cute%20Ghost%20Body%20with%20scalloped%20bottom%20--%3E%0A%20%20%20%20%3Cpath%20%0A%20%20%20%20%20%20d%3D%22M12%202C7.58172%202%204%205.58172%204%2010V20.5C4%2021.3284%205%2021.8284%205.58579%2021.2426L7.29289%2019.5355C7.68342%2019.145%208.31658%2019.145%208.70711%2019.5355L11.2929%2022.1213C11.6834%2022.5118%2012.3166%2022.5118%2012.7071%2022.1213L15.2929%2019.5355C15.6834%2019.145%2016.3166%2019.145%2016.7071%2019.5355L18.4142%2021.2426C19%2021.8284%2020%2021.3284%2020%2020.5V10C20%205.58172%2016.4183%202%2012%202Z%22%20%0A%20%20%20%20%20%20fill%3D%22currentColor%22%20%0A%20%20%20%20%20%20fill-opacity%3D%220.1%22%20%0A%20%20%20%20%20%20stroke%3D%22currentColor%22%20%0A%20%20%20%20%20%20stroke-width%3D%222%22%20%0A%20%20%20%20%20%20stroke-linejoin%3D%22round%22%20%0A%20%20%20%20/%3E%0A%20%20%20%20%3C%21--%20Happy%20Eyes%20--%3E%0A%20%20%20%20%3Cpath%20d%3D%22M7.5%2010Q8.5%208.5%209.5%2010%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20/%3E%0A%20%20%20%20%3Cpath%20d%3D%22M14.5%2010Q15.5%208.5%2016.5%2010%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20/%3E%0A%20%20%20%20%0A%20%20%20%20%3C%21--%20Cute%20little%20mouth%20--%3E%0A%20%20%20%20%3Cpath%20d%3D%22M11%2013Q12%2014.5%2013%2013%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20/%3E%0A%20%20%3C/g%3E%0A%0A%20%20%3C%21--%20Sparkles%20--%3E%0A%20%20%3Ccircle%20cx%3D%222%22%20cy%3D%227%22%20r%3D%221%22%20fill%3D%22currentColor%22%20class%3D%22gc-sparkle-1%22%20/%3E%0A%20%20%3Ccircle%20cx%3D%2222%22%20cy%3D%2215%22%20r%3D%221%22%20fill%3D%22currentColor%22%20class%3D%22gc-sparkle-2%22%20/%3E%0A%20%20%3Ccircle%20cx%3D%2220%22%20cy%3D%225%22%20r%3D%221.5%22%20fill%3D%22currentColor%22%20class%3D%22gc-sparkle-3%22%20/%3E%0A%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #050508;
      --surface: #0a0a12;
      --surface-elevated: #10101c;
      --surface-subtle: #151528;
      --bezel-outer: rgba(255, 255, 255, 0.05);
      --border: rgba(255, 255, 255, 0.08);
      --border-light: rgba(255, 255, 255, 0.14);
      --border-focus: rgba(139, 92, 246, 0.7);
      --accent: #8b5cf6;
      --accent-hover: #7c3aed;
      --accent-light: #a78bfa;
      --accent-muted: rgba(139, 92, 246, 0.14);
      --cyan: #06b6d4;
      --cyan-muted: rgba(6, 182, 212, 0.15);
      --success: #10b981;
      --success-muted: rgba(16, 185, 129, 0.12);
      --text: #f0f0f5;
      --text-muted: #888899;
      --text-dim: #555566;
      --ease-g2: cubic-bezier(0.32, 0.72, 0, 1);
      --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
      --radius-bezel-outer: 30px;
      --radius-bezel-inner: 24px;
      --radius-squircle-md: 16px;
      --radius-squircle-sm: 12px;
      --radius-pill: 9999px;
      --mouse-x: 50vw;
      --mouse-y: 50vh;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    html {
      width: 100%;
      min-height: 100%;
      background-color: var(--bg);
    }

    body {
      width: 100%;
      min-height: 100vh;
      min-height: 100dvh;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(16px, 4vh, 48px) clamp(14px, 3vw, 24px);
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
      line-height: 1.5;
    }

    /* Perfectly Centered Preloader Splash Screen */
    .splash-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      z-index: 9999;
      background: #050508;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1), visibility 0.5s ease;
      pointer-events: all;
    }
    .splash-overlay.dismissed {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .splash-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 16px;
      max-width: 320px;
      width: 100%;
      padding: 20px;
    }
    .splash-logo-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
    }
    .splash-glow-ring {
      position: absolute;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%);
      filter: blur(8px);
    }
    .splash-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 2px;
    }
    .splash-subtitle {
      font-size: 11.5px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .splash-loader-bar {
      width: 160px;
      height: 3px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
      position: relative;
      margin-top: 6px;
    }
    .splash-loader-progress {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 45%;
      background: linear-gradient(90deg, transparent, #8b5cf6, #06b6d4, transparent);
      border-radius: 9999px;
      animation: splashSlide 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    @keyframes splashSlide {
      0% { left: -45%; }
      100% { left: 145%; }
    }

    /* Singular, Premium Interactive Mouse Spotlight */
    .spotlight {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 1;
      background: radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(139, 92, 246, 0.12), transparent 60%);
      transition: background 0.06s ease-out;
    }

    /* Ambient Spatial Mesh Lighting */
    .ambient-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      background:
        radial-gradient(ellipse 65% 50% at 50% -10%, rgba(139, 92, 246, 0.16), transparent 70%),
        radial-gradient(ellipse 50% 40% at 85% 100%, rgba(6, 182, 212, 0.08), transparent 60%);
    }

    .canvas-noise {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    }

    /* Responsive Main Container Stage */
    .main-stage {
      position: relative;
      z-index: 3;
      width: 100%;
      max-width: 630px;
      margin: auto 0;
    }

    /* Double-Bezel Outer Enclosure */
    .dock-outer {
      position: relative;
      width: 100%;
      background: var(--bezel-outer);
      border: 1px solid var(--border);
      border-radius: var(--radius-bezel-outer);
      padding: clamp(4px, 1vw, 6px);
      box-shadow: 
        0 24px 64px -16px rgba(0, 0, 0, 0.8),
        0 0 40px -10px rgba(139, 92, 246, 0.16);
      animation: springFadeIn 0.7s var(--ease-g2) both;
    }

    .dock-inner {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-bezel-inner);
      padding: clamp(20px, 4vw, 34px) clamp(16px, 3.5vw, 30px);
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
    }

    @keyframes springFadeIn {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Brand Header */
    .hero-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: clamp(14px, 2.5vh, 22px);
      flex-wrap: wrap;
    }

    .brand-identity {
      display: flex;
      align-items: center;
      gap: clamp(10px, 2vw, 14px);
    }

    .ghost-avatar {
      width: clamp(44px, 5vw, 52px);
      height: clamp(44px, 5vw, 52px);
      border-radius: var(--radius-squircle-md);
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(6, 182, 212, 0.08));
      border: 1px solid rgba(139, 92, 246, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 18px rgba(139, 92, 246, 0.25);
      transition: transform 0.3s var(--ease-spring), border-color 0.3s ease;
      cursor: pointer;
      flex-shrink: 0;
    }
    .ghost-avatar:hover {
      transform: scale(1.08) rotate(-3deg);
      border-color: rgba(167, 139, 250, 0.8);
    }

    .title-meta h1 {
      font-size: clamp(18px, 2.5vw, 21px);
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #ffffff;
      line-height: 1.2;
    }
    .title-meta p {
      font-size: clamp(11.5px, 1.6vw, 12.5px);
      color: var(--text-muted);
      margin-top: 2px;
      font-weight: 400;
    }

    /* Continuous Squircle Status Badges */
    .squircle-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: var(--radius-squircle-sm);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      white-space: nowrap;
      border: 1px solid transparent;
      transition: all 0.25s var(--ease-g2);
    }

    .squircle-badge-success {
      background: var(--success-muted);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.25);
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.08);
    }

    .pulsing-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: heartbeat 2s infinite ease-in-out;
    }

    @keyframes heartbeat {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.45;
        transform: scale(0.8);
      }
    }

    /* Auto-Redirect & State Banners */
    .state-banner {
      font-size: clamp(11.5px, 1.5vw, 12.5px);
      text-align: center;
      padding: clamp(10px, 1.8vh, 13px) 14px;
      border-radius: var(--radius-squircle-sm);
      line-height: 1.45;
      margin-bottom: clamp(14px, 2vh, 20px);
      transition: all 0.25s ease;
    }

    .state-banner-info {
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.25);
      color: #d8b4fe;
    }

    .state-banner-active {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #6ee7b7;
    }

    /* Telemetry Teleport Card (Top Priority) */
    .telemetry-card {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-squircle-md);
      padding: clamp(14px, 2vh, 18px) clamp(14px, 2.5vw, 20px);
      margin-bottom: clamp(14px, 2vh, 20px);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .telemetry-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: clamp(11.5px, 1.6vw, 12.5px);
      gap: 10px;
      flex-wrap: wrap;
    }

    .telemetry-label {
      color: var(--text-muted);
      font-weight: 500;
      flex-shrink: 0;
    }

    .telemetry-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: clamp(11px, 1.5vw, 12px);
      color: var(--accent-light);
      word-break: break-all;
      text-align: right;
    }

    /* Primary Quick Action Cluster (Top Priority) */
    .actions-cluster {
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-bottom: clamp(16px, 2.5vh, 24px);
    }

    .action-btn {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: clamp(10px, 1.6vh, 13px) clamp(14px, 2vw, 20px);
      border-radius: var(--radius-squircle-sm);
      font-size: clamp(12.5px, 1.6vw, 13.5px);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.22s var(--ease-g2);
      outline: none;
      width: 100%;
    }
    .action-btn:active {
      transform: scale(0.985);
    }

    .btn-label-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-bubble {
      width: clamp(28px, 3.5vw, 32px);
      height: clamp(28px, 3.5vw, 32px);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.25s var(--ease-spring);
      flex-shrink: 0;
    }
    .action-btn:hover .btn-bubble {
      transform: translateX(3px) scale(1.08);
    }

    .btn-primary {
      background: var(--accent);
      color: #ffffff;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      box-shadow: 0 6px 24px rgba(139, 92, 246, 0.45);
      transform: translateY(-1px);
    }
    .btn-primary .btn-bubble {
      background: rgba(255, 255, 255, 0.2);
    }

    .btn-secondary {
      background: var(--surface-elevated);
      color: var(--text);
      border-color: var(--border);
    }
    .btn-secondary:hover {
      background: var(--surface-subtle);
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-1px);
    }
    .btn-secondary .btn-bubble {
      background: rgba(255, 255, 255, 0.06);
    }

    .btn-tertiary {
      background: rgba(139, 92, 246, 0.08);
      color: var(--accent-light);
      border-color: rgba(139, 92, 246, 0.25);
    }
    .btn-tertiary:hover {
      background: rgba(139, 92, 246, 0.16);
      border-color: rgba(139, 92, 246, 0.45);
      color: #ffffff;
      transform: translateY(-1px);
    }
    .btn-tertiary .btn-bubble {
      background: rgba(139, 92, 246, 0.18);
      color: #ffffff;
    }

    .btn-sub-note {
      font-size: 10px;
      font-weight: 400;
      opacity: 0.75;
      display: block;
      margin-top: 1px;
    }

    /* Tool Showcase & Features Section (Bottom Half) */
    .promo-section-header {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border);
      padding-top: clamp(14px, 2vh, 18px);
    }

    .promo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: clamp(14px, 2vh, 18px);
    }
    @media (max-width: 520px) {
      .promo-grid {
        grid-template-columns: 1fr;
      }
    }

    .feature-card {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-squircle-sm);
      padding: clamp(10px, 1.5vh, 14px);
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.22s ease, background-color 0.22s ease, transform 0.22s var(--ease-g2);
      cursor: default;
    }
    .feature-card:hover {
      border-color: rgba(139, 92, 246, 0.45);
      background: var(--surface-subtle);
      transform: translateY(-2px);
    }

    .promo-card-title {
      font-size: clamp(11.5px, 1.5vw, 12.5px);
      font-weight: 600;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .promo-card-desc {
      font-size: clamp(10.5px, 1.4vw, 11px);
      color: var(--text-muted);
      line-height: 1.38;
    }

    /* Supported Local AI Tools Showcase Grid */
    .tools-section {
      margin-bottom: clamp(14px, 2vh, 18px);
    }
    .tools-eyebrow {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      margin-bottom: 7px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tools-tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .tool-tag {
      font-size: 10px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--surface-subtle);
      border: 1px solid var(--border);
      color: var(--text-muted);
      transition: all 0.2s var(--ease-g2);
      cursor: default;
    }
    .tool-tag:hover {
      color: #fff;
      border-color: rgba(139, 92, 246, 0.5);
      background: var(--accent-muted);
      transform: translateY(-1px);
    }

    /* Author Attribution & Ecosystem Footer */
    .footer-tray {
      margin-top: clamp(12px, 1.8vh, 18px);
      padding-top: clamp(12px, 1.8vh, 16px);
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .author-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-muted);
      text-decoration: none;
      transition: all 0.2s var(--ease-g2);
    }
    .author-badge:hover {
      background: var(--accent-muted);
      border-color: rgba(139, 92, 246, 0.35);
      color: var(--text);
      transform: translateY(-1px);
    }
    .author-name {
      color: #ffffff;
      font-weight: 600;
    }
    .author-links {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 10.5px;
      color: var(--text-dim);
      flex-wrap: wrap;
      justify-content: center;
    }
    .author-links a {
      color: var(--text-dim);
      text-decoration: none;
      transition: color 0.18s ease;
    }
    .author-links a:hover {
      color: var(--accent-light);
    }

    .security-signature {
      font-size: 9.5px;
      color: var(--text-dim);
      text-align: center;
      letter-spacing: 0.02em;
    }

    /* Compact Vertical Viewports & Zoom Adaptability */
    @media (max-height: 720px) {
      body {
        padding: 16px 12px;
      }
      .main-stage {
        margin: 0;
      }
      .promo-grid {
        gap: 6px;
      }
      .feature-card {
        padding: 8px 10px;
      }
      .telemetry-card {
        padding: 12px 14px;
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <!-- Centered Preloader Splash Screen -->
  <div class="splash-overlay" id="splash-screen">
    <div class="splash-card">
      <div class="splash-logo-container">
        <div class="splash-glow-ring"></div>
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes gc-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-1.5px); }
    }
    @keyframes gc-sparkle {
      0%, 100% { opacity: 0.4; transform: scale(0.8) translate(0, 0); }
      50% { opacity: 0.9; transform: scale(1.2) translate(0, -1px); }
    }
    .gc-ghost-body {
      animation: gc-float 4s ease-in-out infinite;
      transform-origin: center;
      color: #8B5CF6;
    }
    .gc-sparkle-1 {
      animation: gc-sparkle 3s ease-in-out infinite;
      transform-origin: 2px 7px;
      color: #8B5CF6;
    }
    .gc-sparkle-2 {
      animation: gc-sparkle 3s ease-in-out infinite 1s;
      transform-origin: 22px 15px;
      color: #8B5CF6;
    }
    .gc-sparkle-3 {
      animation: gc-sparkle 3s ease-in-out infinite 2s;
      transform-origin: 20px 5px;
      color: #8B5CF6;
    }
  </style>
  
  <g class="gc-ghost-body">
    <!-- Cute Ghost Body with scalloped bottom -->
    <path 
      d="M12 2C7.58172 2 4 5.58172 4 10V20.5C4 21.3284 5 21.8284 5.58579 21.2426L7.29289 19.5355C7.68342 19.145 8.31658 19.145 8.70711 19.5355L11.2929 22.1213C11.6834 22.5118 12.3166 22.5118 12.7071 22.1213L15.2929 19.5355C15.6834 19.145 16.3166 19.145 16.7071 19.5355L18.4142 21.2426C19 21.8284 20 21.3284 20 20.5V10C20 5.58172 16.4183 2 12 2Z" 
      fill="currentColor" 
      fill-opacity="0.1" 
      stroke="currentColor" 
      stroke-width="2" 
      stroke-linejoin="round" 
    />
    <!-- Happy Eyes -->
    <path d="M7.5 10Q8.5 8.5 9.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M14.5 10Q15.5 8.5 16.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Cute little mouth -->
    <path d="M11 13Q12 14.5 13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <!-- Sparkles -->
  <circle cx="2" cy="7" r="1" fill="currentColor" class="gc-sparkle-1" />
  <circle cx="22" cy="15" r="1" fill="currentColor" class="gc-sparkle-2" />
  <circle cx="20" cy="5" r="1.5" fill="currentColor" class="gc-sparkle-3" />
</svg>
      </div>
      <div>
        <div class="splash-title">GhostCompute</div>
        <div class="splash-subtitle">Connecting Zero-Trust Node</div>
      </div>
      <div class="splash-loader-bar">
        <div class="splash-loader-progress"></div>
      </div>
    </div>
  </div>

  <div class="ambient-glow"></div>
  <div class="spotlight" id="spotlight"></div>
  <div class="canvas-noise"></div>

  <div class="main-stage">
    <div class="dock-outer">
      <div class="dock-inner">
        <!-- Top Section: Header & Live Indicators -->
        <div class="hero-header">
          <div class="brand-identity">
            <div class="ghost-avatar" id="avatar-cube" title="GhostCompute Engine">
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes gc-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-1.5px); }
    }
    @keyframes gc-sparkle {
      0%, 100% { opacity: 0.4; transform: scale(0.8) translate(0, 0); }
      50% { opacity: 0.9; transform: scale(1.2) translate(0, -1px); }
    }
    .gc-ghost-body {
      animation: gc-float 4s ease-in-out infinite;
      transform-origin: center;
      color: #8B5CF6;
    }
    .gc-sparkle-1 {
      animation: gc-sparkle 3s ease-in-out infinite;
      transform-origin: 2px 7px;
      color: #8B5CF6;
    }
    .gc-sparkle-2 {
      animation: gc-sparkle 3s ease-in-out infinite 1s;
      transform-origin: 22px 15px;
      color: #8B5CF6;
    }
    .gc-sparkle-3 {
      animation: gc-sparkle 3s ease-in-out infinite 2s;
      transform-origin: 20px 5px;
      color: #8B5CF6;
    }
  </style>
  
  <g class="gc-ghost-body">
    <!-- Cute Ghost Body with scalloped bottom -->
    <path 
      d="M12 2C7.58172 2 4 5.58172 4 10V20.5C4 21.3284 5 21.8284 5.58579 21.2426L7.29289 19.5355C7.68342 19.145 8.31658 19.145 8.70711 19.5355L11.2929 22.1213C11.6834 22.5118 12.3166 22.5118 12.7071 22.1213L15.2929 19.5355C15.6834 19.145 16.3166 19.145 16.7071 19.5355L18.4142 21.2426C19 21.8284 20 21.3284 20 20.5V10C20 5.58172 16.4183 2 12 2Z" 
      fill="currentColor" 
      fill-opacity="0.1" 
      stroke="currentColor" 
      stroke-width="2" 
      stroke-linejoin="round" 
    />
    <!-- Happy Eyes -->
    <path d="M7.5 10Q8.5 8.5 9.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M14.5 10Q15.5 8.5 16.5 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Cute little mouth -->
    <path d="M11 13Q12 14.5 13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </g>

  <!-- Sparkles -->
  <circle cx="2" cy="7" r="1" fill="currentColor" class="gc-sparkle-1" />
  <circle cx="22" cy="15" r="1" fill="currentColor" class="gc-sparkle-2" />
  <circle cx="20" cy="5" r="1.5" fill="currentColor" class="gc-sparkle-3" />
</svg>
            </div>
            <div class="title-meta">
              <h1>GhostCompute Node</h1>
              <p>Private Zero-Trust AI Cloud Gateway</p>
            </div>
          </div>
          <div class="squircle-badge squircle-badge-success">
            <div class="pulsing-dot"></div>
            <span>Active Tunnel</span>
          </div>
        </div>

        <!-- Connection State Banner -->
        <div id="state-banner" class="state-banner state-banner-info">
          Validating cryptographic tunnel parameters...
        </div>

        <!-- Connection Telemetry & Endpoints (Top Priority) -->
        <div class="telemetry-card">
          <div class="telemetry-item">
            <span class="telemetry-label">Cloudflare Endpoint</span>
            <span class="telemetry-value" id="tunnel-display">Detecting...</span>
          </div>
          <div class="telemetry-item" id="token-row" style="display: none;">
            <span class="telemetry-label">Pairing Token</span>
            <span class="telemetry-value" id="token-display"></span>
          </div>
          <div class="telemetry-item">
            <span class="telemetry-label">Security Protocol</span>
            <span class="telemetry-value" style="color: #34d399;">Noise-XX Handshake + ChaCha20-Poly1305</span>
          </div>
        </div>

        <!-- Primary Action Cluster (Top Priority for Quick Launch & Copy) -->
        <div class="actions-cluster">
          <a href="#" id="launch-app-btn" class="action-btn btn-primary">
            <div class="btn-label-group">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <div>
                <span id="launch-app-text">Pair with GhostCompute Client</span>
                <span class="btn-sub-note">Direct App Protocol (ghostcompute://)</span>
              </div>
            </div>
            <div class="btn-bubble">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          </a>

          <a href="#" id="launch-localhost-btn" class="action-btn btn-tertiary">
            <div class="btn-label-group">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <div>
                <span id="launch-localhost-text">Connect via Localhost App</span>
                <span class="btn-sub-note">Reliable Fallback (http://localhost:1420)</span>
              </div>
            </div>
            <div class="btn-bubble">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </div>
          </a>

          <button type="button" id="copy-btn" class="action-btn btn-secondary">
            <div class="btn-label-group">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <div>
                <span id="copy-text">Copy Tunnel Endpoint URL</span>
                <span class="btn-sub-note">Manual input for any client or terminal</span>
              </div>
            </div>
            <div class="btn-bubble">
              <svg id="copy-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
          </button>
        </div>

        <!-- Bottom Section: Tool Showcase, App Highlights & Ecosystem Promo -->
        <div class="promo-section-header">
          <span>About GhostCompute &amp; Platform Capabilities</span>
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent-light);">FEATURES</span>
        </div>

        <div id="promo-section" class="promo-grid">
          <div class="feature-card">
            <div class="promo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-light);">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
              <span>Remote GPU Power</span>
            </div>
            <p class="promo-card-desc">Offload LLM inference and generative workflows to your dedicated home or office machine effortlessly.</p>
          </div>

          <div class="feature-card">
            <div class="promo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-light);">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <span>Universal AI Bridge</span>
            </div>
            <p class="promo-card-desc">Seamless integration with Ollama, ComfyUI, Open WebUI, LM Studio, n8n, Tabby, and 10+ open-source tools.</p>
          </div>

          <div class="feature-card">
            <div class="promo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-light);">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span>Noise-XX Zero-Trust</span>
            </div>
            <p class="promo-card-desc">True peer-to-peer authenticated cryptography. No intermediate cloud servers can inspect or decrypt your data.</p>
          </div>

          <div class="feature-card">
            <div class="promo-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-light);">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <span>Zero-Config Tunneling</span>
            </div>
            <p class="promo-card-desc">Instant Cloudflare Quick Tunnels traverse NATs and firewalls without requiring static IPs or port forwarding.</p>
          </div>
        </div>

        <div class="tools-section">
          <div class="tools-eyebrow">
            <span>Supported Host AI Engines &amp; Workspaces</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--accent-light);">16 RECIPES</span>
          </div>
          <div class="tools-tags-container">
            <span class="tool-tag">Ollama</span>
            <span class="tool-tag">LM Studio</span>
            <span class="tool-tag">Open WebUI</span>
            <span class="tool-tag">ComfyUI</span>
            <span class="tool-tag">n8n</span>
            <span class="tool-tag">AnythingLLM</span>
            <span class="tool-tag">Tabby</span>
            <span class="tool-tag">Dify</span>
            <span class="tool-tag">Whisper ASR</span>
            <span class="tool-tag">Jan.ai</span>
            <span class="tool-tag">Flowise</span>
            <span class="tool-tag">Langflow</span>
            <span class="tool-tag">Qdrant</span>
          </div>
        </div>

        <a href="https://github.com/John-Varghese-EH/GhostCompute" target="_blank" rel="noopener noreferrer" id="get-app-btn" class="action-btn btn-secondary" style="margin-top: 10px;">
          <div class="btn-label-group">
            <span>Get GhostCompute App (Free &amp; Open Source)</span>
          </div>
          <div class="btn-bubble">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
        </a>

        <div class="footer-tray">
          <a href="https://github.com/John-Varghese-EH" target="_blank" rel="noopener noreferrer" class="author-badge">
            <span>Architected by</span>
            <span class="author-name">John Varghese (J0X)</span>
          </a>
          <div class="author-links">
            <a href="https://github.com/John-Varghese-EH/GhostCompute" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
            <span>&middot;</span>
            <a href="https://linkedin.com/in/John--Varghese" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <span>&middot;</span>
            <span>GhostCompute v0.1.0</span>
          </div>
          <p class="security-signature">
            End-to-End Encrypted Tunnel &middot; Ephemeral Peer-to-Peer Pipeline &middot; No Cloud Telemetry
          </p>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      // Dismiss splashscreen preloader smoothly once loaded
      window.addEventListener("load", function() {
        setTimeout(function() {
          var splash = document.getElementById("splash-screen");
          if (splash) {
            splash.classList.add("dismissed");
            setTimeout(function() { splash.remove(); }, 600);
          }
        }, 600);
      });

      // Fallback timer if load event already fired
      setTimeout(function() {
        var splash = document.getElementById("splash-screen");
        if (splash && !splash.classList.contains("dismissed")) {
          splash.classList.add("dismissed");
          setTimeout(function() { splash.remove(); }, 600);
        }
      }, 900);

      // Single, Clean Interactive Mouse Spotlight Tracking
      var root = document.documentElement;
      window.addEventListener("mousemove", function(e) {
        root.style.setProperty("--mouse-x", e.clientX + "px");
        root.style.setProperty("--mouse-y", e.clientY + "px");
      }, { passive: true });

      // Token & Connection Routing Logic
      var token = __TOKEN_JSON__;
      var params = new URLSearchParams(window.location.search);
      if (!token && params.get("token")) {
        token = params.get("token");
      }

      var currentUrl = window.location.origin;
      var fullUrl = window.location.href;
      
      var tunnelDisplay = document.getElementById("tunnel-display");
      if (tunnelDisplay) tunnelDisplay.textContent = currentUrl;

      var stateBanner = document.getElementById("state-banner");
      var launchAppBtn = document.getElementById("launch-app-btn");
      var launchAppText = document.getElementById("launch-app-text");
      var launchLocalhostBtn = document.getElementById("launch-localhost-btn");
      var launchLocalhostText = document.getElementById("launch-localhost-text");

      // Set up Localhost Web / App Fallback URL
      var localhostBase = "http://localhost:1420";
      var localhostUrl = localhostBase + "/?connect=" + encodeURIComponent(currentUrl) + (token ? ("&token=" + encodeURIComponent(token)) : "");
      if (launchLocalhostBtn) {
        launchLocalhostBtn.href = localhostUrl;
      }

      if (token) {
        var tokenRow = document.getElementById("token-row");
        var tokenDisplay = document.getElementById("token-display");
        if (tokenRow && tokenDisplay) {
          tokenRow.style.display = "flex";
          tokenDisplay.textContent = token.substring(0, 14) + "...";
        }

        if (stateBanner) {
          stateBanner.className = "state-banner state-banner-active";
          stateBanner.textContent = "Pairing token verified. Launching GhostCompute desktop client...";
        }

        var deepLink = "ghostcompute://pair?url=" + encodeURIComponent(currentUrl) + "&token=" + encodeURIComponent(token);
        if (launchAppBtn) {
          launchAppBtn.href = deepLink;
          if (launchAppText) launchAppText.textContent = "Launch in GhostCompute Client";
        }

        // Attempt protocol handler launch
        try {
          window.location.href = deepLink;
        } catch (e) {}

        // Fallback guidance if protocol handler fails or isn't supported on Linux
        setTimeout(function() {
          if (stateBanner) {
            stateBanner.innerHTML = "If your desktop app did not open automatically, click <strong>Pair with GhostCompute Client</strong>, use the <strong>Connect via Localhost App</strong> button (recommended for Linux), or copy the endpoint below.";
          }
        }, 2200);

      } else {
        // NO PAIRING TOKEN PROVIDED: No use redirecting - present tool promotion & clear explanation
        if (stateBanner) {
          stateBanner.className = "state-banner state-banner-info";
          stateBanner.innerHTML = "<strong>Notice:</strong> No pairing token was provided in this URL. Automatic app pairing requires an authenticated token from your Host machine. Explore GhostCompute below or copy this endpoint into your client.";
        }

        if (launchAppBtn) {
          launchAppBtn.href = "ghostcompute://pair?url=" + encodeURIComponent(currentUrl);
          if (launchAppText) launchAppText.textContent = "Open in GhostCompute (Manual Token Entry)";
        }
      }

      var copyBtn = document.getElementById("copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", function() {
          navigator.clipboard.writeText(fullUrl).then(function() {
            var el = document.getElementById("copy-text");
            if (el) el.textContent = "Copied to Clipboard!";
            setTimeout(function() {
              if (el) el.textContent = "Copy Tunnel Endpoint URL";
            }, 2000);
          }).catch(function() {
            var el = document.getElementById("copy-text");
            if (el) el.textContent = "Failed to copy";
          });
        });
      }
    })();
  </script>
</body>
</html>"##;

    let html = HTML_TEMPLATE.replace("__TOKEN_JSON__", &token_json);

    let resp = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         Access-Control-Allow-Origin: *\r\n\
         \r\n\
         {}",
        html.len(),
        html
    );

    let _ = socket.write_all(resp.as_bytes()).await;
    let _ = socket.flush().await;
    let _ = socket.shutdown().await;
}
