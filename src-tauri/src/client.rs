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
    ) -> Result<(), ClientError> {
        let url = format!("ws://{}:{}", address, port);
        self.connect_url(noise_priv, &url).await?;
        self.last_address = Some(address.to_string());
        self.last_port = Some(port);
        self.last_peer_id = Some(peer_id.to_string());
        Ok(())
    }

    pub async fn connect_url(
        &mut self,
        noise_priv: [u8; 32],
        url: &str,
    ) -> Result<(), ClientError> {
        self.status = ConnectionStatus::Connecting;

        // Ensure url has scheme
        let mut ws_url = url.to_string();
        if !ws_url.starts_with("ws://") && !ws_url.starts_with("wss://") {
            if ws_url.starts_with("http://") {
                ws_url = ws_url.replace("http://", "ws://");
            } else if ws_url.starts_with("https://") {
                ws_url = ws_url.replace("https://", "wss://");
            } else {
                ws_url = format!("wss://{}", ws_url);
            }
        }

        let request =
            tokio_tungstenite::tungstenite::client::IntoClientRequest::into_client_request(
                ws_url.as_str(),
            )
            .map_err(|e| ClientError::Transport(e.to_string()))?;

        match tokio_tungstenite::connect_async(request).await {
            Ok((ws_stream, _)) => {
                use futures_util::StreamExt;
                let (tx, rx) = ws_stream.split();
                let tx: crate::transport::BoxSink = Box::new(tx);
                let rx: crate::transport::BoxStream = Box::new(rx);

                match transport::handshake_as_initiator(tx, rx, &noise_priv).await {
                    Ok(mut session) => {
                        let remote_id = session.peer_id().to_string();
                        
                        let (tx_send, mut rx_send) = mpsc::channel::<Vec<u8>>(100);
                        self.sender = Some(tx_send);
                        
                        let routers = self.routers.clone();
                        let app_routers = self.routers.clone();
                        
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
                                                    } else if action == "pair_sas" || action == "pair_ok" {
                                                        // For pairing payloads, broadcast to the pair channel if it exists
                                                        let r = routers.lock().await;
                                                        if let Some(sender) = r.get("pairing") {
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
                    Err(e) => {
                        self.status = ConnectionStatus::Disconnected;
                        Err(ClientError::Transport(e.to_string()))
                    }
                }
            }
            Err(e) => {
                self.status = ConnectionStatus::Disconnected;
                Err(ClientError::Transport(e.to_string()))
            }
        }
    }

    pub async fn disconnect(&mut self) {
        self.sender = None;
        self.status = ConnectionStatus::Disconnected;
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
        // Parse chat request to extract the message
        let v: serde_json::Value = serde_json::from_slice(payload).unwrap();
        let message = v.get("message").unwrap().as_str().unwrap().to_string();
        
        // We simulate a proxy chat by forwarding to the local /api/chat instead, 
        // but GhostCompute's Tauri UI still expects "chat-chunk" events!
        // So we build an HttpProxyRequest to /api/chat
        let req_id = uuid::Uuid::new_v4().to_string();
        
        let ollama_req = serde_json::json!({
            "model": crate::ollama::auto_select_model(),
            "messages": [
                {
                    "role": "user",
                    "content": message
                }
            ],
            "stream": true
        });
        
        let req = HttpProxyRequest {
            action: "http_proxy".to_string(),
            req_id: req_id.clone(),
            method: "POST".to_string(),
            path: "/api/chat".to_string(),
            headers: vec![("Content-Type".to_string(), "application/json".to_string())],
            body_base64: Some(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, serde_json::to_vec(&ollama_req).unwrap())),
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

    pub async fn get_remote_models(&mut self) -> Result<Vec<serde_json::Value>, ClientError> {
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
                return Ok(models.clone());
            }
        }
        Ok(vec![])
    }
}
