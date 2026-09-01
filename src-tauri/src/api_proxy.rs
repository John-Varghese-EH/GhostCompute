use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::any,
    Router,
};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::client::{HttpProxyRequest, HttpProxyResponseChunk, ClientConnection};

#[derive(Clone)]
pub struct ProxyState {
    pub api_key: Option<String>,
    pub p2p_client: Arc<tokio::sync::Mutex<ClientConnection>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ApiProxyStatus {
    pub running: bool,
    pub port: u16,
    pub endpoint: String,
}

pub struct ApiProxyHandle {
    shutdown_tx: Option<oneshot::Sender<()>>,
    pub status: ApiProxyStatus,
}

impl ApiProxyHandle {
    pub fn new() -> Self {
        Self {
            shutdown_tx: None,
            status: ApiProxyStatus {
                running: false,
                port: 0,
                endpoint: String::new(),
            },
        }
    }

    pub async fn start(
        &mut self,
        port: u16,
        api_key: Option<String>,
        p2p_client: Arc<tokio::sync::Mutex<ClientConnection>>,
    ) -> Result<(), String> {
        if self.shutdown_tx.is_some() {
            return Err("API proxy is already running".to_string());
        }

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let proxy_state = ProxyState {
            api_key: api_key.clone(),
            p2p_client,
        };

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let app = Router::new()
            .route("/", any(proxy_handler_root))
            .route("/*path", any(proxy_handler))
            .layer(cors)
            .with_state(Arc::new(proxy_state));

        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
            .await
            .map_err(|e| format!("Failed to bind API proxy to port {}: {}", port, e))?;

        log::info!("Transparent HTTP proxy started on http://127.0.0.1:{}", port);

        tokio::spawn(async move {
            let graceful = axum::serve(listener, app).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });
            if let Err(e) = graceful.await {
                log::error!("API proxy server error: {}", e);
            }
        });

        self.shutdown_tx = Some(shutdown_tx);
        self.status = ApiProxyStatus {
            running: true,
            port,
            endpoint: format!("http://127.0.0.1:{}", port),
        };

        Ok(())
    }

    pub async fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        self.status = ApiProxyStatus {
            running: false,
            port: 0,
            endpoint: String::new(),
        };
        log::info!("API proxy stopped.");
    }

    pub fn get_status(&self) -> ApiProxyStatus {
        self.status.clone()
    }
}

async fn proxy_handler_root(
    State(state): State<Arc<ProxyState>>,
    req: Request,
) -> impl IntoResponse {
    handle_proxy_request(state, "/", req).await
}

async fn proxy_handler(
    Path(path): Path<String>,
    State(state): State<Arc<ProxyState>>,
    req: Request,
) -> impl IntoResponse {
    let full_path = format!("/{}", path);
    handle_proxy_request(state, &full_path, req).await
}

async fn handle_proxy_request(
    state: Arc<ProxyState>,
    path: &str,
    req: Request,
) -> axum::response::Response {
    let method = req.method().to_string();
    
    // Extract headers
    let mut headers = Vec::new();
    let req_headers = req.headers().clone();
    
    // Check auth if required
    if let Some(key) = &state.api_key {
        if !key.is_empty() {
            let auth = req_headers
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            let provided = auth
                .strip_prefix("Bearer ")
                .or_else(|| auth.strip_prefix("bearer "))
                .unwrap_or("");

            if provided != key {
                return (
                    StatusCode::UNAUTHORIZED,
                    "Invalid API key provided",
                )
                    .into_response();
            }
        }
    }

    // Pass headers to Host
    for (name, value) in req_headers.iter() {
        if let Ok(v) = value.to_str() {
            headers.push((name.to_string(), v.to_string()));
        }
    }

    // Extract body
    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Failed to read request body: {}", e),
            )
                .into_response()
        }
    };
    
    let body_base64 = if !body_bytes.is_empty() {
        Some(BASE64.encode(body_bytes))
    } else {
        None
    };

    let req_id = uuid::Uuid::new_v4().to_string();
    let proxy_req = HttpProxyRequest {
        action: "http_proxy".to_string(),
        req_id: req_id.clone(),
        method,
        path: path.to_string(),
        headers,
        body_base64,
    };

    let mut is_connected = false;
    {
        let client_state = state.p2p_client.lock().await;
        if let crate::client::ConnectionStatus::Connected { .. } = client_state.status() {
            is_connected = true;
        }
    }

    if !is_connected {
        // If not connected, we should probably fallback to local Ollama directly?
        // For a transparent tunnel, we assume the user intends to hit the remote host.
        // But if they are just running locally, we can proxy to local Ollama.
        // We'll use reqwest to hit the local Ollama.
        let local_url = format!("http://127.0.0.1:11434{}", path);
        let client = reqwest::Client::new();
        
        let mut req_builder = client.request(
            reqwest::Method::from_bytes(proxy_req.method.as_bytes()).unwrap_or(reqwest::Method::GET),
            &local_url
        );
        
        for (k, v) in proxy_req.headers {
            req_builder = req_builder.header(k, v);
        }
        
        if let Some(b64) = proxy_req.body_base64 {
            if let Ok(bytes) = BASE64.decode(b64) {
                req_builder = req_builder.body(bytes);
            }
        }
        
        match req_builder.send().await {
            Ok(res) => {
                let status = res.status();
                let mut headers = HeaderMap::new();
                for (name, value) in res.headers() {
                    headers.insert(name.clone(), value.clone());
                }
                
                let stream = res.bytes_stream();
                let body = Body::from_stream(stream);
                
                return (status, headers, body).into_response();
            },
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    format!("Failed to proxy to local Ollama: {}", e),
                )
                    .into_response();
            }
        }
    }

    // We are connected! Send to P2P Host
    let rx = {
        let mut client_state = state.p2p_client.lock().await;
        match client_state.proxy_http_request(proxy_req).await {
            Ok(rx) => rx,
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    format!("Failed to send proxy request to remote host: {}", e),
                ).into_response();
            }
        }
    };
    
    // We need to wait for the first chunk to get the HTTP status code and headers
    let mut rx = rx;
    let first_chunk_val = match rx.recv().await {
        Some(val) => val,
        None => {
            state.p2p_client.lock().await.remove_proxy_router(&req_id).await;
            return (
                StatusCode::BAD_GATEWAY,
                "Remote host closed connection without responding",
            ).into_response();
        }
    };
    
    let first_chunk: HttpProxyResponseChunk = match serde_json::from_value(first_chunk_val) {
        Ok(c) => c,
        Err(_) => {
            state.p2p_client.lock().await.remove_proxy_router(&req_id).await;
            return (
                StatusCode::BAD_GATEWAY,
                "Invalid response from remote host",
            ).into_response();
        }
    };
    
    let status_code = StatusCode::from_u16(first_chunk.status_code.unwrap_or(200))
        .unwrap_or(StatusCode::OK);
        
    let mut response_headers = HeaderMap::new();
    if let Some(hdrs) = first_chunk.headers {
        for (k, v) in hdrs {
            if let Ok(name) = HeaderName::from_bytes(k.as_bytes()) {
                if let Ok(val) = HeaderValue::from_bytes(v.as_bytes()) {
                    response_headers.insert(name, val);
                }
            }
        }
    }
    
    // Create a stream for the body
    let (tx, body_rx) = tokio::sync::mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(100);
    
    // Send the first chunk data if present
    if let Some(b64) = first_chunk.data_base64 {
        if let Ok(bytes) = BASE64.decode(b64) {
            if !bytes.is_empty() {
                let _ = tx.send(Ok(bytes.into())).await;
            }
        }
    }
    
    let client_clone = state.p2p_client.clone();
    let req_id_clone = req_id.clone();
    
    if !first_chunk.done {
        tokio::spawn(async move {
            while let Some(chunk_val) = rx.recv().await {
                if let Ok(chunk) = serde_json::from_value::<HttpProxyResponseChunk>(chunk_val) {
                    if let Some(b64) = chunk.data_base64 {
                        if let Ok(bytes) = BASE64.decode(b64) {
                            if !bytes.is_empty()
                                && tx.send(Ok(bytes.into())).await.is_err() {
                                    break;
                                }
                        }
                    }
                    if chunk.done {
                        break;
                    }
                }
            }
            client_clone.lock().await.remove_proxy_router(&req_id_clone).await;
        });
    } else {
        tokio::spawn(async move {
            client_clone.lock().await.remove_proxy_router(&req_id_clone).await;
        });
    }
    
    let stream = tokio_stream::wrappers::ReceiverStream::new(body_rx);
    let body = Body::from_stream(stream);
    
    (status_code, response_headers, body).into_response()
}
