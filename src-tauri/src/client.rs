use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{mpsc, Mutex};
use tokio::time::Duration;

use crate::transport;

#[derive(Error, Debug)]
pub enum ClientError {
    #[error("Not connected")]
    NotConnected,
    #[error("Transport error: {0}")]
    Transport(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Host rejected connection")]
    HostRejected,
}

#[derive(Serialize, Clone, Debug)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected {
        mode: String,
        latency_ms: u32,
        host_name: String,
    },
    Reconnecting {
        attempt: u32,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HttpProxyRequest {
    pub action: String, // "http_proxy"
    pub req_id: String,
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_base64: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HttpProxyResponseChunk {
    pub action: String, // "http_proxy_chunk"
    pub req_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<(String, String)>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_base64: Option<String>,
    pub done: bool,
}

pub struct ClientConnection {
    status: ConnectionStatus,
    sender: Option<mpsc::Sender<Vec<u8>>>,
    routers: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
    last_address: Option<String>,
    last_port: Option<u16>,
    last_peer_id: Option<String>,
}

impl ClientConnection {
    pub fn new() -> Self {
        Self {
            status: ConnectionStatus::Disconnected,
            sender: None,
            routers: Arc::new(Mutex::new(HashMap::new())),
            last_address: None,
            last_port: None,
            last_peer_id: None,
        }
    }

    pub async fn connect(
        &mut self,
        noise_priv: [u8; 32],
        peer_id: &str,
        address: &str,
        port: u16,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), ClientError> {
        let url = format!("ws://{}:{}", address, port);
        self.connect_url(noise_priv, &url, app_handle).await?;
        self.last_address = Some(address.to_string());
        self.last_port = Some(port);
        self.last_peer_id = Some(peer_id.to_string());
        Ok(())
    }

    pub async fn connect_url(
        &mut self,
        noise_priv: [u8; 32],
        url: &str,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), ClientError> {
        self.status = ConnectionStatus::Connecting;

        let mut clean_url = url.trim().to_string();

        // 1. Deep link unpacker: ghostcompute://pair?url=...&token=...
        if clean_url.starts_with("ghostcompute://") {
            if let Ok(parsed) = url::Url::parse(&clean_url) {
                let mut target_url = None;
                let mut token = None;
                for (k, v) in parsed.query_pairs() {
                    if k == "url" {
                        target_url = Some(v.into_owned());
                    } else if k == "token" {
                        token = Some(v.into_owned());
                    }
                }
                if let Some(mut target) = target_url {
                    if let Some(tok) = token {
                        if !target.contains("token=") {
                            let sep = if target.contains('?') { "&" } else { "?" };
                            target = format!("{}{}{}", target, sep, format!("token={}", tok));
                        }
                    }
                    clean_url = target;
                }
            }
        }

        // 2. Cleanly separate base endpoint from query parameters (e.g. ?token=...)
        let (raw_base, query) = match clean_url.split_once('?') {
            Some((base, q)) => (base.trim_end_matches('/'), Some(q)),
            None => (clean_url.trim_end_matches('/'), None),
        };

        let mut ws_base = raw_base.to_string();
        let has_scheme = ws_base.starts_with("ws://")
            || ws_base.starts_with("wss://")
            || ws_base.starts_with("http://")
            || ws_base.starts_with("https://");

        if !has_scheme {
            let is_tunnel = ws_base.contains("trycloudflare.com")
                || ws_base.contains("cloudflareaccess.com")
                || ws_base.contains(".pinggy.link");
            if !ws_base.contains(':') && !is_tunnel {
                ws_base = format!("{}:8384", ws_base);
            }
            if is_tunnel {
                ws_base = format!("wss://{}", ws_base);
            } else {
                ws_base = format!("ws://{}", ws_base);
            }
        } else if let Some(stripped) = ws_base.strip_prefix("http://") {
            ws_base = format!("ws://{}", stripped);
        } else if let Some(stripped) = ws_base.strip_prefix("https://") {
            ws_base = format!("wss://{}", stripped);
        }

        // 3. Ensure the WebSocket request-target has a valid root slash before query or path
        let ws_url = match query {
            Some(q) => format!("{}/?{}", ws_base, q),
            None => format!("{}/", ws_base),
        };

        let mut request =
            tokio_tungstenite::tungstenite::client::IntoClientRequest::into_client_request(
                ws_url.as_str(),
            )
            .map_err(|e| ClientError::Transport(format!("Invalid URL '{}': {}", ws_url, e)))?;

        // Add standard User-Agent so Cloudflare Edge WAF / bot mitigations do not reject the connection
        request.headers_mut().insert(
            tokio_tungstenite::tungstenite::http::header::USER_AGENT,
            tokio_tungstenite::tungstenite::http::HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) GhostCompute/0.1.0 Safari/537.36",
            ),
        );

        log::info!("[Client] Initiating connection to: {}", ws_url);

        // Allow 15 seconds for WAN / Cloudflare edge tunnel connections to establish
        let connect_timeout = tokio::time::timeout(
            Duration::from_secs(15),
            tokio_tungstenite::connect_async(request),
        )
        .await;

        match connect_timeout {
            Ok(Ok((ws_stream, response))) => {
                log::info!("[Client] WebSocket transport established with {} (HTTP status: {})", ws_url, response.status());
                use futures_util::StreamExt;
                let (tx, rx) = ws_stream.split();
                let tx: crate::transport::BoxSink = Box::new(tx);
                let rx: crate::transport::BoxStream = Box::new(rx);

                // Allow 15 seconds for Noise cryptographic handshake over WAN tunnels
                log::info!("[Client] Commencing Noise-XX cryptographic handshake with {}", ws_url);
                let handshake_timeout = tokio::time::timeout(
                    Duration::from_secs(15),
                    transport::handshake_as_initiator(tx, rx, &noise_priv),
                )
                .await;

                match handshake_timeout {
                    Ok(Ok(mut session)) => {
                        let remote_id = session.peer_id().to_string();
                        log::info!("[Client] Cryptographic handshake SUCCESS with peer: {}", remote_id);
                        self.last_peer_id = Some(remote_id.clone());
                        self.last_address = Some(ws_url.clone());
                        
                        let (tx_send, mut rx_send) = mpsc::channel::<Vec<u8>>(100);
                        self.sender = Some(tx_send);
                        
                        let routers = self.routers.clone();
                        let app_routers = self.routers.clone();
                        let app_clone = app_handle.clone();
                        let remote_peer_for_actor = remote_id.clone();
                        let ws_url_for_actor = ws_url.clone();
                        
                        // Spawn background actor loop
                        tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    payload = rx_send.recv() => {
                                        if let Some(p) = payload {
                                            if let Err(e) = session.send(&p).await {
                                                log::error!("Error sending to session: {}", e);
                                                break;
                                            }
                                        } else {
                                            break;
                                        }
                                    }
                                    recv_res = session.recv() => {
                                        match recv_res {
                                            Ok(chunk) => {
                                                if let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&chunk) {
                                                    let action = parsed.get("action").and_then(|v| v.as_str()).unwrap_or("");
                                                    if action == "http_proxy_chunk" {
                                                        if let Some(req_id) = parsed.get("req_id").and_then(|v| v.as_str()) {
                                                            let mut r = routers.lock().await;
                                                            if let Some(sender) = r.get(req_id) {
                                                                if sender.send(parsed.clone()).await.is_err() {
                                                                    // Channel closed, remove it
                                                                    r.remove(req_id);
                                                                }
                                                            }
                                                        }
                                                    } else if action == "pair_ok" {
                                                        log::info!("[Client] Received pair_ok approval from host!");
                                                        if let Some(ref app) = app_clone {
                                                            use tauri::Manager;
                                                            use tauri::Emitter;
                                                            if let Some(app_state) = app.try_state::<crate::AppState>() {
                                                                let store = app_state.peer_store.lock().await;
                                                                let _ = store.add_peer(&remote_peer_for_actor, &ws_url_for_actor, &remote_peer_for_actor);
                                                                let mut ps = app_state.pairing_state.lock().await;
                                                                *ps = crate::pairing::PairingState::Completed { peer_id: remote_peer_for_actor.clone() };
                                                                let _ = app.emit("pairing-state-changed", ());
                                                                log::info!("[Client] Pairing state set to Completed and saved to trusted peers for {}", remote_peer_for_actor);
                                                            }
                                                        }
                                                        let r = routers.lock().await;
                                                        if let Some(sender) = r.get("pairing") {
                                                            let _ = sender.send(parsed.clone()).await;
                                                        }
                                                    } else if action == "pair_sas" {
                                                        let r = routers.lock().await;
                                                        if let Some(sender) = r.get("pairing") {
                                                            let _ = sender.send(parsed.clone()).await;
                                                        }
                                                    } else if action == "sys_stats_response" {
                                                        let r = routers.lock().await;
                                                        if let Some(sender) = r.get("sys_stats") {
                                                            let _ = sender.send(parsed.clone()).await;
                                                        }
                                                    }
                                                }
                                            }
                                            Err(_) => {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            // Clean up
                            let mut r = app_routers.lock().await;
                            r.clear();
                        });

                        self.status = ConnectionStatus::Connected {
                            mode: if ws_url.starts_with("wss") {
                                "WAN (WSS)".to_string()
                            } else {
                                "LAN (WS)".to_string()
                            },
                            latency_ms: 0,
                            host_name: remote_id[..8.min(remote_id.len())].to_string(),
                        };
                        Ok(())
                    }
                    Ok(Err(e)) => {
                        self.status = ConnectionStatus::Disconnected;
                        Err(ClientError::Transport(format!("Noise cryptographic handshake failed: {}", e)))
                    }
                    Err(_) => {
                        self.status = ConnectionStatus::Disconnected;
                        Err(ClientError::Transport(format!("Cryptographic handshake timed out with {}. The host did not reply.", ws_url)))
                    }
                }
            }
            Ok(Err(e)) => {
                self.status = ConnectionStatus::Disconnected;
                let err_str = e.to_string();
                log::warn!("[Client] Transport connection failed for {}: {}", ws_url, err_str);
                let friendly = if err_str.contains("530") {
                    format!("Cloudflare Tunnel returned HTTP 530 (Origin Down or Expired). The Quick Tunnel URL has expired or is still provisioning. On the Host PC, click 'Restart Tunnel' to obtain a fresh URL.", )
                } else if err_str.contains("400") {
                    format!("Connection rejected (HTTP 400 Bad Request) by {}. The WebSocket handshake request was malformed or rejected by edge proxy.", ws_url)
                } else if err_str.contains("refused") || err_str.contains("10061") || err_str.contains("111") {
                    format!("Connection refused by {}. Verify that GhostCompute is actively running in Server Mode on the Host PC and port 8384 is allowed through Windows Firewall.", ws_url)
                } else {
                    format!("Failed to connect to {}: {}", ws_url, err_str)
                };
                Err(ClientError::Transport(friendly))
            }
            Err(_) => {
                self.status = ConnectionStatus::Disconnected;
                log::warn!("[Client] Connection timeout (15s) waiting for {}", ws_url);
                Err(ClientError::Transport(format!(
                    "Connection to {} timed out after 15 seconds. If connecting over Wi-Fi, ensure Windows Defender Firewall allows port 8384. If on another network, ensure the Cloudflare Quick Tunnel is active on the Host.",
                    ws_url
                )))
            }
        }
    }

    pub async fn disconnect(&mut self) {
        self.sender = None;
        self.status = ConnectionStatus::Disconnected;
    }

    pub async fn send_payload(&self, payload: &[u8]) -> Result<(), ClientError> {
        let sender = self.sender.as_ref().ok_or(ClientError::NotConnected)?;
        sender
            .send(payload.to_vec())
            .await
            .map_err(|e| ClientError::Transport(e.to_string()))?;
        Ok(())
    }

    pub async fn send_request(&mut self, payload: &[u8]) -> Result<Vec<u8>, ClientError> {
        let sender = self.sender.as_ref().ok_or(ClientError::NotConnected)?;
        
        // For pairing, we use a special "pairing" channel
        let (tx, mut rx) = mpsc::channel(1);
        self.routers.lock().await.insert("pairing".to_string(), tx);
        
        sender
            .send(payload.to_vec())
            .await
            .map_err(|e| ClientError::Transport(e.to_string()))?;
            
        let res = match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await {
            Ok(Some(msg)) => serde_json::to_vec(&msg).map_err(|_| ClientError::Transport("serialization failed".into())),
            Ok(None) => Err(ClientError::Transport("connection closed".into())),
            Err(_) => Err(ClientError::Transport("timeout".into())),
        };
        
        self.routers.lock().await.remove("pairing");
        res
    }

    pub fn last_peer_id(&self) -> Option<String> { self.last_peer_id.clone() }
    pub fn last_address(&self) -> Option<String> { self.last_address.clone() }

    pub fn status(&self) -> ConnectionStatus {
        self.status.clone()
    }
    
    pub async fn proxy_http_request(
        &mut self,
        request: HttpProxyRequest,
    ) -> Result<mpsc::Receiver<serde_json::Value>, ClientError> {
        let sender = self.sender.as_ref().ok_or(ClientError::NotConnected)?.clone();
        
        let (tx, rx) = mpsc::channel(100);
        self.routers.lock().await.insert(request.req_id.clone(), tx);
        
        let payload = serde_json::to_vec(&request).map_err(|e| ClientError::Transport(e.to_string()))?;
        sender.send(payload).await.map_err(|e| ClientError::Transport(e.to_string()))?;
        
        Ok(rx)
    }
    
    pub async fn remove_proxy_router(&self, req_id: &str) {
        self.routers.lock().await.remove(req_id);
    }
}

impl ClientConnection {
    pub async fn send_chat_stream(
        &mut self,
        payload: &[u8],
        app: tauri::AppHandle,
    ) -> Result<(), ClientError> {
        // Parse chat request to extract the message and model
        let v: serde_json::Value = serde_json::from_slice(payload)
            .map_err(|e| ClientError::Transport(format!("Invalid chat payload: {}", e)))?;
        let message = v.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();

        let explicit_model = v.get("model")
            .and_then(|m| m.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        let target_model = if let Some(m) = explicit_model {
            m
        } else {
            let remote_models = self.get_remote_models().await.unwrap_or_default();
            remote_models.into_iter().next().unwrap_or_else(|| "llama3.2".to_string())
        };
        
        let req_id = uuid::Uuid::new_v4().to_string();
        
        let ollama_req = serde_json::json!({
            "model": target_model,
            "messages": [
                {
                    "role": "user",
                    "content": message
                }
            ],
            "stream": true,
            "keep_alive": "30m"
        });
        
        let req = HttpProxyRequest {
            action: "http_proxy".to_string(),
            req_id: req_id.clone(),
            method: "POST".to_string(),
            path: "/api/chat".to_string(),
            headers: vec![("Content-Type".to_string(), "application/json".to_string())],
            body_base64: Some(base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                serde_json::to_vec(&ollama_req)?,
            )),
        };
        
        let mut rx = self.proxy_http_request(req).await?;
        
        use tauri::Emitter;
        
        // Wait for chunks
        while let Some(chunk) = rx.recv().await {
            if let Ok(proxy_chunk) = serde_json::from_value::<HttpProxyResponseChunk>(chunk) {
                if let Some(b64) = proxy_chunk.data_base64 {
                    if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                        // Ollama returns newline delimited JSON chunks
                        if let Ok(text) = String::from_utf8(bytes) {
                            for line in text.split('\n').filter(|l| !l.is_empty()) {
                                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
                                    let _ = app.emit("chat-chunk", parsed);
                                }
                            }
                        }
                    }
                }
                if proxy_chunk.done {
                    // Send an empty done chunk to trigger UI end
                    let _ = app.emit("chat-chunk", serde_json::json!({"done": true}));
                    break;
                }
            }
        }
        
        self.remove_proxy_router(&req_id).await;
        Ok(())
    }

    pub async fn get_remote_models(&mut self) -> Result<Vec<String>, ClientError> {
        let req_id = uuid::Uuid::new_v4().to_string();
        let req = HttpProxyRequest {
            action: "http_proxy".to_string(),
            req_id: req_id.clone(),
            method: "GET".to_string(),
            path: "/api/tags".to_string(),
            headers: vec![],
            body_base64: None,
        };
        
        let mut rx = self.proxy_http_request(req).await?;
        let mut full_body = Vec::new();
        
        while let Some(chunk) = rx.recv().await {
            if let Ok(proxy_chunk) = serde_json::from_value::<HttpProxyResponseChunk>(chunk) {
                if let Some(b64) = proxy_chunk.data_base64 {
                    if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                        full_body.extend(bytes);
                    }
                }
                if proxy_chunk.done {
                    break;
                }
            }
        }
        
        self.remove_proxy_router(&req_id).await;
        
        if let Ok(parsed) = serde_json::from_slice::<serde_json::Value>(&full_body) {
            if let Some(models) = parsed.get("models").and_then(|m| m.as_array()) {
                let names = models.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect();
                return Ok(names);
            }
        }
        Ok(vec![])
    }

    pub async fn get_host_sys_stats(&mut self) -> Result<serde_json::Value, ClientError> {
        let sender = self.sender.as_ref().ok_or(ClientError::NotConnected)?;
        
        let (tx, mut rx) = mpsc::channel(1);
        self.routers.lock().await.insert("sys_stats".to_string(), tx);
        
        let payload = serde_json::to_vec(&serde_json::json!({ "action": "get_sys_stats" }))
            .map_err(|e| ClientError::Transport(e.to_string()))?;
            
        sender.send(payload).await.map_err(|e| ClientError::Transport(e.to_string()))?;
            
        let res = match tokio::time::timeout(Duration::from_secs(5), rx.recv()).await {
            Ok(Some(msg)) => {
                if let Some(data) = msg.get("data") {
                    Ok(data.clone())
                } else {
                    Err(ClientError::Transport("Invalid sys_stats format".into()))
                }
            },
            Ok(None) => Err(ClientError::Transport("connection closed".into())),
            Err(_) => Err(ClientError::Transport("timeout".into())),
        };
        
        self.routers.lock().await.remove("sys_stats");
        res
    }
}
