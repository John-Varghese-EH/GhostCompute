mod admission;
mod client;
mod cloudflared_manager;
mod compression;
mod discovery;
mod identity;
mod masker;
mod ollama;
mod api_proxy;
mod pairing;
mod peer_store;
mod server;
mod settings;
mod transport;
pub mod sys_monitor;
pub mod docker;
pub mod recipes;
pub mod orchestrator;

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::Mutex;

use crate::client::ClientConnection;
use crate::client::ConnectionStatus;
use crate::discovery::{DiscoveredPeer, MdnsHandle};
use crate::identity::NodeIdentity;
use crate::ollama::{ModelInfo, OllamaManager, OllamaStatus};
use crate::api_proxy::{ApiProxyHandle, ApiProxyStatus};
use crate::pairing::{PairingCode, PairingLink, PairingState};
use crate::peer_store::{PeerStore, TrustedPeer};
use crate::server::{HostServer, SessionInfo};
use crate::settings::{AppSettings, SettingsStore};

pub struct AppState {
    pub identity: Arc<NodeIdentity>,
    pub peer_store: Arc<Mutex<PeerStore>>,
    pub mdns: Arc<Mutex<Option<MdnsHandle>>>,
    pub ollama: Arc<Mutex<OllamaManager>>,
    pub server: Arc<Mutex<HostServer>>,
    pub client: Arc<Mutex<ClientConnection>>,
    pub discovered_peers: Arc<Mutex<Vec<DiscoveredPeer>>>,
    pub pairing_state: Arc<Mutex<PairingState>>,
    pub pairing_code: Arc<Mutex<Option<PairingCode>>>,
    pub pairing_link: Arc<Mutex<Option<PairingLink>>>,
    pub settings: Arc<Mutex<SettingsStore>>,
    pub api_proxy: Arc<Mutex<ApiProxyHandle>>,
    pub orchestrator: Arc<crate::orchestrator::Orchestrator>,
    pub active_tunnel_url: Arc<Mutex<Option<String>>>,
}

// -- Discovery commands --

#[tauri::command]
async fn get_discovered_peers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoveredPeer>, String> {
    let peers = state.discovered_peers.lock().await;
    Ok(peers.clone())
}

#[tauri::command]
async fn start_discovery(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut mdns_lock = state.mdns.lock().await;
    if mdns_lock.is_none() {
        let handle = MdnsHandle::new().map_err(|e| format!("{}", e))?;
        *mdns_lock = Some(handle);
    }

    let mdns = mdns_lock.as_mut().ok_or("mDNS not initialized")?;
    let own_id = state.identity.peer_id();
    let mut rx = mdns.browse_peers(own_id).map_err(|e| format!("{}", e))?;

    let peers = state.discovered_peers.clone();
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let mut peer_list = peers.lock().await;
            let mut changed = false;
            match event {
                discovery::DiscoveryEvent::PeerFound(peer) => {
                    if let Some(existing) = peer_list.iter_mut().find(|p| p.peer_id == peer.peer_id) {
                        for addr in peer.addresses {
                            if !existing.addresses.contains(&addr) {
                                existing.addresses.push(addr);
                                changed = true;
                            }
                        }
                    } else {
                        peer_list.push(peer);
                        changed = true;
                    }
                }
                discovery::DiscoveryEvent::PeerLost(id) => {
                    let before = peer_list.len();
                    peer_list.retain(|p| p.peer_id != id);
                    if peer_list.len() != before {
                        changed = true;
                    }
                }
            }
            if changed {
                let _ = app_handle.emit("peers-changed", ());
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_discovery(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mdns_lock = state.mdns.lock().await;
    if let Some(handle) = mdns_lock.as_mut() {
        let _ = handle.stop_browsing();
    }
    Ok(())
}

// -- Pairing commands --

#[tauri::command]
async fn get_pairing_state(state: tauri::State<'_, AppState>) -> Result<PairingState, String> {
    let s = state.pairing_state.lock().await;
    Ok(s.clone())
}

fn prioritize_addresses(addrs: &[String]) -> Vec<String> {
    let mut sorted = addrs.to_vec();
    sorted.sort_by(|a, b| {
        let a_ip: Option<std::net::IpAddr> = a.parse().ok();
        let b_ip: Option<std::net::IpAddr> = b.parse().ok();

        let rank = |ip_opt: Option<std::net::IpAddr>| -> u8 {
            match ip_opt {
                Some(std::net::IpAddr::V4(v4)) => {
                    let octets = v4.octets();
                    // Deprioritize WSL2/Hyper-V/Docker defaults (172.17-31.x.x) or link-local (169.254.x.x)
                    if octets[0] == 169 && octets[1] == 254 {
                        4
                    } else if octets[0] == 172 && (17..=31).contains(&octets[1]) {
                        3
                    } else if octets[0] == 192 && octets[1] == 168 {
                        0 // High priority standard home/office LAN
                    } else if octets[0] == 10 {
                        1 // High priority 10.x.x.x LAN
                    } else {
                        2
                    }
                }
                Some(std::net::IpAddr::V6(_)) => 5, // Deprioritize IPv6 for local home LAN
                None => 6,
            }
        };

        rank(a_ip).cmp(&rank(b_ip))
    });
    sorted
}

#[tauri::command]
async fn initiate_pairing(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    let peers = state.discovered_peers.lock().await;
    let peer = peers
        .iter()
        .find(|p| p.peer_id == peer_id)
        .ok_or_else(|| "Peer not found".to_string())?
        .clone();
    drop(peers);

    let candidate_addrs = prioritize_addresses(&peer.addresses);
    if candidate_addrs.is_empty() {
        return Err("No network address available for discovered peer".to_string());
    }

    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    let mut last_err = String::new();
    let mut connected = false;

    for addr in &candidate_addrs {
        log::info!("[Pairing] Attempting initiate_pairing with peer {} at {}:{}", peer_id, addr, peer.port);
        match client.connect(noise_priv, &peer_id, addr, peer.port, Some(app.clone())).await {
            Ok(_) => {
                connected = true;
                break;
            }
            Err(e) => {
                log::warn!("[Pairing] Failed to connect to {}:{}: {}", addr, peer.port, e);
                last_err = format!("{}", e);
            }
        }
    }

    if !connected {
        let mut ps = state.pairing_state.lock().await;
        *ps = crate::pairing::PairingState::Failed {
            reason: format!("Failed to reach host across {} IP addresses: {}", candidate_addrs.len(), last_err),
        };
        let _ = app.emit("pairing-state-changed", ());
        return Err(format!("Could not connect to host ({})", last_err));
    }

    let payload = serde_json::json!({
        "action": "pair"
    });
    let req_bytes = serde_json::to_vec(&payload).map_err(|e| format!("Failed to serialize payload: {}", e))?;
    let resp_bytes = client
        .send_request(&req_bytes)
        .await
        .map_err(|e| format!("{}", e))?;

    let resp: serde_json::Value =
        serde_json::from_slice(&resp_bytes).map_err(|e| format!("{}", e))?;

    if resp.get("action").and_then(|a| a.as_str()) == Some("pair_sas") {
        if let Some(sas) = resp.get("sas").and_then(|s| s.as_str()) {
            let mut ps = state.pairing_state.lock().await;
            *ps = crate::pairing::PairingState::AwaitingConfirmation {
                sas: sas.to_string(),
                peer_id: peer_id.clone(),
                device_name: peer.device_name.clone(),
            };
            let _ = app.emit("pairing-state-changed", ());
            return Ok(());
        }
    } else if resp.get("action").and_then(|a| a.as_str()) == Some("pair_ok") {
        let store = state.peer_store.lock().await;
        store
            .add_peer(&peer_id, &peer.device_name, &peer_id)
            .map_err(|e| format!("{}", e))?;
        let mut ps = state.pairing_state.lock().await;
        *ps = crate::pairing::PairingState::Completed { peer_id };
        let _ = app.emit("pairing-state-changed", ());
        return Ok(());
    }

    let mut ps = state.pairing_state.lock().await;
    *ps = crate::pairing::PairingState::Failed {
        reason: "Pairing handshake rejected by host".into(),
    };
    let _ = app.emit("pairing-state-changed", ());
    Err("Pairing rejected".into())
}

#[tauri::command]
async fn confirm_pairing(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    confirmed: bool,
) -> Result<(), String> {
    let mut ps = state.pairing_state.lock().await;
    if !confirmed {
        *ps = PairingState::Failed {
            reason: "Pairing rejected by user".to_string(),
        };
        let _ = app.emit("pairing-state-changed", ());
        return Ok(());
    }
    if let PairingState::AwaitingConfirmation {
        peer_id,
        device_name,
        ..
    } = ps.clone()
    {
        let store = state.peer_store.lock().await;
        let noise_key = peer_id.clone();
        store
            .add_peer(&peer_id, &device_name, &noise_key)
            .map_err(|e| format!("{}", e))?;
        *ps = PairingState::Completed { peer_id };
        let _ = app.emit("pairing-state-changed", ());

        drop(store);
        drop(ps);
        let client = state.client.lock().await;
        let confirm_msg = serde_json::json!({
            "action": "pair_confirm",
            "confirmed": true
        });
        if let Ok(bytes) = serde_json::to_vec(&confirm_msg) {
            let _ = client.send_payload(&bytes).await;
        }
    }
    Ok(())
}

#[tauri::command]
async fn generate_pairing_code(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let code = pairing::generate_pairing_code();
    let code_str = code.code.clone();
    let mut lock = state.pairing_code.lock().await;
    *lock = Some(code);
    Ok(code_str)
}

#[tauri::command]
async fn submit_pairing_code(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<bool, String> {
    let peers = state.discovered_peers.lock().await.clone();

    for peer in peers {
        let candidate_addrs = prioritize_addresses(&peer.addresses);
        for address in candidate_addrs {
            let mut client = state.client.lock().await;
            let noise_priv = state.identity.noise_private;
            if client
                .connect(noise_priv, &peer.peer_id, &address, peer.port, Some(app.clone()))
                .await
                .is_ok()
            {
                let payload = serde_json::json!({
                    "action": "pair",
                    "code": code
                });
                if let Ok(req_bytes) = serde_json::to_vec(&payload) {
                    if let Ok(resp_bytes) = client.send_request(&req_bytes).await {
                        if let Ok(resp) = serde_json::from_slice::<serde_json::Value>(&resp_bytes) {
                            if resp.get("action").and_then(|a| a.as_str()) == Some("pair_ok") {
                                let store = state.peer_store.lock().await;
                                let _ = store.add_peer(&peer.peer_id, &peer.device_name, &peer.peer_id);
                                let mut ps = state.pairing_state.lock().await;
                                *ps = crate::pairing::PairingState::Completed {
                                    peer_id: peer.peer_id.clone(),
                                };
                                let _ = app.emit("pairing-state-changed", ());
                                return Ok(true);
                            }
                        }
                    }
                }
                let _ = client.disconnect().await;
            }
        }
    }

    let mut ps = state.pairing_state.lock().await;
    *ps = crate::pairing::PairingState::Failed {
        reason: "Code invalid or peer not found".into(),
    };
    let _ = app.emit("pairing-state-changed", ());
    Ok(false)
}

#[tauri::command]
async fn generate_pairing_link(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let settings = state.settings.lock().await.get();
    
    // Check in order: 1) Configured ZeroTrust tunnel URL, 2) Active free Quick Tunnel URL, 3) LAN IP
    let host_url = if let Some(ref cf) = settings.cloudflare_tunnel_url {
        if !cf.trim().is_empty() {
            Some(cf.clone())
        } else {
            None
        }
    } else {
        None
    };

    let effective_url = match host_url {
        Some(url) => url,
        None => {
            let active_tun = state.active_tunnel_url.lock().await.clone();
            match active_tun {
                Some(url) => url,
                None => {
                    let lan_ip = get_local_ip().unwrap_or_else(|_| "127.0.0.1".to_string());
                    format!("http://{}:{}", lan_ip, settings.host_port)
                }
            }
        }
    };
    
    let link = pairing::generate_pairing_link(Some(effective_url));
    let url = link.url.clone();
    let mut lock = state.pairing_link.lock().await;
    *lock = Some(link);
    Ok(url)
}

// -- Peer management commands --

#[tauri::command]
async fn get_paired_devices(state: tauri::State<'_, AppState>) -> Result<Vec<TrustedPeer>, String> {
    let store = state.peer_store.lock().await;
    store.list_peers().map_err(|e| format!("{}", e))
}

#[tauri::command]
async fn revoke_device(state: tauri::State<'_, AppState>, peer_id: String) -> Result<(), String> {
    let store = state.peer_store.lock().await;
    store.revoke_peer(&peer_id).map_err(|e| format!("{}", e))
}

#[tauri::command]
async fn remove_device(state: tauri::State<'_, AppState>, peer_id: String) -> Result<(), String> {
    let store = state.peer_store.lock().await;
    store.remove_peer(&peer_id).map_err(|e| format!("{}", e))
}

// -- Host commands --

#[tauri::command]
async fn start_hosting(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut server = state.server.lock().await;
    let peer_store = state.peer_store.clone();
    let noise_priv = state.identity.noise_private;
    let settings = state.settings.lock().await.get();
    let port = settings.host_port;
    let gate = Arc::new(crate::admission::AdmissionGate::new(&settings));
    let cf_token = settings.cloudflare_token.clone();

    match server
        .start(
            noise_priv,
            port,
            peer_store,
            cf_token,
            gate,
            app,
        )
        .await
    {
        Ok(_) => {},
        Err(crate::server::ServerError::AlreadyRunning) => {
            log::info!("[Server] Server already running on port {}", port);
        },
        Err(e) => return Err(format!("{}", e)),
    }

    let mut mdns_lock = state.mdns.lock().await;
    if mdns_lock.is_none() {
        let handle = crate::discovery::MdnsHandle::new().map_err(|e| format!("{}", e))?;
        *mdns_lock = Some(handle);
    }
    if let Some(mdns) = mdns_lock.as_mut() {
        let dev_name = crate::identity::NodeIdentity::device_name();
        let display_name = format!("GhostCompute ({})", dev_name);
        if let Err(e) = mdns.start_advertising(state.identity.peer_id().as_str(), &display_name, port) {
            log::warn!("[mDNS] Failed to start advertising service on LAN: {}", e);
        } else {
            log::info!("[mDNS] Broadcasting '{}' on port {}", display_name, port);
        }
    }

    Ok(())
}

#[tauri::command]
async fn is_hosting(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let server = state.server.lock().await;
    Ok(server.is_running())
}

#[tauri::command]
async fn stop_hosting(state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut server = state.server.lock().await;
    server.stop().await;

    let mut mdns_lock = state.mdns.lock().await;
    if let Some(mdns) = mdns_lock.as_mut() {
        let _ = mdns.stop_advertising();
    }

    let mut tun = state.active_tunnel_url.lock().await;
    *tun = None;

    let _ = app_handle.emit("tunnel-url-cleared", ());
    let _ = app_handle.emit("tunnel-url-ready", "");

    Ok(())
}

#[tauri::command]
async fn get_active_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SessionInfo>, String> {
    let server = state.server.lock().await;
    Ok(server.get_sessions())
}

#[tauri::command]
async fn kill_session(state: tauri::State<'_, AppState>, peer_id: String) -> Result<(), String> {
    let server = state.server.lock().await;
    server.kill_session(&peer_id).await;
    Ok(())
}

#[tauri::command]
async fn kill_all_sessions(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut server = state.server.lock().await;
    server.stop().await;
    Ok(())
}

#[tauri::command]
async fn get_active_tunnel_url(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let tun = state.active_tunnel_url.lock().await;
    Ok(tun.clone())
}

#[tauri::command]
async fn start_quick_tunnel(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let mut server = state.server.lock().await;
    let settings = state.settings.lock().await.get();
    server.spawn_tunnel(settings.host_port, None, &app_handle).await?;
    Ok("Quick tunnel starting".to_string())
}

// -- Client commands --

#[tauri::command]
async fn connect_to_host(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    let peers = state.discovered_peers.lock().await;
    let peer = peers
        .iter()
        .find(|p| p.peer_id == peer_id)
        .ok_or_else(|| "Peer not found".to_string())?
        .clone();
    drop(peers);

    let candidate_addrs = prioritize_addresses(&peer.addresses);
    if candidate_addrs.is_empty() {
        return Err("No address available for peer".to_string());
    }

    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    let mut last_err = String::new();

    for addr in &candidate_addrs {
        log::info!("[Client] Trying host {}:{}", addr, peer.port);
        match client.connect(noise_priv, &peer_id, addr, peer.port, Some(app.clone())).await {
            Ok(_) => return Ok(()),
            Err(e) => {
                log::warn!("[Client] Failed connecting to {}:{}: {}", addr, peer.port, e);
                last_err = format!("{}", e);
            }
        }
    }

    Err(format!(
        "Could not connect to host across {} IP addresses: {}",
        candidate_addrs.len(),
        last_err
    ))
}

#[tauri::command]
async fn connect_to_url(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    client
        .connect_url(noise_priv, &url, Some(app.clone()))
        .await
        .map_err(|e| format!("{}", e))?;

    let remote_id = client.last_peer_id().unwrap_or_else(|| "remote-host".to_string());

    let mut token = None;
    let mut code = None;
    if let Ok(parsed) = url::Url::parse(&url) {
        for (k, v) in parsed.query_pairs() {
            if k == "token" {
                token = Some(v.into_owned());
            } else if k == "code" || k == "pin" {
                code = Some(v.into_owned());
            }
        }
    }
    if token.is_none() || code.is_none() {
        if let Some((_, query)) = url.split_once('?') {
            for pair in query.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "token" && token.is_none() {
                        token = Some(v.to_string());
                    } else if (k == "code" || k == "pin") && code.is_none() {
                        code = Some(v.to_string());
                    }
                }
            }
        }
    }

    let mut payload_map = serde_json::Map::new();
    payload_map.insert("action".to_string(), serde_json::json!("pair"));
    if let Some(ref t) = token {
        payload_map.insert("token".to_string(), serde_json::json!(t));
    }
    if let Some(ref c) = code {
        payload_map.insert("code".to_string(), serde_json::json!(c));
    }
    
    let payload = serde_json::Value::Object(payload_map);
    
    log::info!("[Pairing] Sending pairing request payload (has_token: {}, has_code: {}) to {}", token.is_some(), code.is_some(), remote_id);
    let req_bytes = serde_json::to_vec(&payload).map_err(|e| format!("Failed to serialize pairing payload: {}", e))?;
    let resp_bytes = client
        .send_request(&req_bytes)
        .await
        .map_err(|e| format!("{}", e))?;

    let resp: serde_json::Value =
        serde_json::from_slice(&resp_bytes).map_err(|e| format!("{}", e))?;
        
    log::info!("[Pairing] Received response action from host: {:?}", resp.get("action"));

    if resp.get("action").and_then(|a| a.as_str()) == Some("pair_ok") {
        log::info!("[Pairing] Successfully authenticated & paired with host {}", remote_id);
        let store = state.peer_store.lock().await;
        let _ = store.add_peer(&remote_id, &url, &remote_id);
        let mut ps = state.pairing_state.lock().await;
        *ps = crate::pairing::PairingState::Completed { peer_id: remote_id };
        let _ = app.emit("pairing-state-changed", ());
        return Ok(());
    } else if resp.get("action").and_then(|a| a.as_str()) == Some("pair_sas") {
        if let Some(sas) = resp.get("sas").and_then(|s| s.as_str()) {
            let mut ps = state.pairing_state.lock().await;
            *ps = crate::pairing::PairingState::AwaitingConfirmation {
                sas: sas.to_string(),
                peer_id: remote_id.clone(),
                device_name: format!("Host ({})", url),
            };
            let _ = app.emit("pairing-state-changed", ());
            return Ok(());
        }
    }
    
    if let Some(err) = resp.get("error").and_then(|e| e.as_str()) {
        let _ = client.disconnect().await;
        let mut ps = state.pairing_state.lock().await;
        *ps = crate::pairing::PairingState::Failed {
            reason: err.to_string(),
        };
        let _ = app.emit("pairing-state-changed", ());
        return Err(err.to_string());
    }
    
    let _ = client.disconnect().await;
    let mut ps = state.pairing_state.lock().await;
    *ps = crate::pairing::PairingState::Failed {
        reason: "Pairing failed".to_string(),
    };
    let _ = app.emit("pairing-state-changed", ());
    Err("Pairing failed".to_string())
}

#[tauri::command]
async fn disconnect_from_host(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut client = state.client.lock().await;
    client.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn send_chat_message(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    message: String,
    model: Option<String>,
) -> Result<(), String> {
    let mut msg = message;
    let settings = state.settings.lock().await.get();

    if settings.strip_credentials {
        msg = crate::masker::mask_credentials(&msg);
    }
    if settings.compression_enabled {
        msg = crate::compression::lite_compress(&msg);
    }

    let payload = serde_json::to_vec(&serde_json::json!({
        "action": "chat",
        "message": msg,
        "model": model,
    }))
    .map_err(|e| format!("{}", e))?;

    let mut client = state.client.lock().await;
    client
        .send_chat_stream(&payload, app)
        .await
        .map_err(|e| format!("{}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_remote_models(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let mut client = state.client.lock().await;
    client
        .get_remote_models()
        .await
        .map_err(|e| format!("{}", e))
}

#[tauri::command]
async fn get_host_sys_stats(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    match client.get_host_sys_stats().await {
        Ok(stats) => Ok(stats),
        Err(_) => {
            let local_stats = crate::sys_monitor::get_system_stats();
            serde_json::to_value(&local_stats).map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
async fn get_connection_status(
    state: tauri::State<'_, AppState>,
) -> Result<ConnectionStatus, String> {
    let client = state.client.lock().await;
    Ok(client.status())
}

#[tauri::command]
async fn get_available_models(state: tauri::State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    let ollama = state.ollama.lock().await;
    ollama.list_models().await.map_err(|e| format!("{}", e))
}

// -- Ollama commands --

#[tauri::command]
async fn get_ollama_status(state: tauri::State<'_, AppState>) -> Result<OllamaStatus, String> {
    let ollama = state.ollama.lock().await;
    Ok(ollama.check_status().await)
}

#[tauri::command]
async fn pull_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let ollama = state.ollama.lock().await;
    let mut rx = ollama
        .pull_model(&name)
        .await
        .map_err(|e| format!("{}", e))?;

    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_handle.emit("pull-progress", &progress);
        }
    });

    Ok(())
}

#[tauri::command]
async fn swap_model(state: tauri::State<'_, AppState>, name: String) -> Result<(), String> {
    // 1. Update settings with new default model
    {
        let mut store = state.settings.lock().await;
        let mut s = store.get();
        s.default_model = Some(name.clone());
        let _ = store.save(s);
    }

    // 2. Preload into Ollama GPU memory if Ollama is running
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let preload_body = serde_json::json!({
        "model": name,
        "keep_alive": "15m"
    });

    let _ = client
        .post("http://127.0.0.1:11434/api/generate")
        .json(&preload_body)
        .send()
        .await;

    log::info!("[Ollama] Swapped and preloaded model: {}", name);
    Ok(())
}

// -- App identity commands --

#[tauri::command]
async fn get_identity_info(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "peer_id": state.identity.peer_id(),
        "device_name": NodeIdentity::device_name(),
    }))
}

// -- Settings commands --

#[tauri::command]
async fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    let store = state.settings.lock().await;
    Ok(store.get())
}

#[tauri::command]
async fn save_settings(
    state: tauri::State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    let mut store = state.settings.lock().await;
    store.save(settings).map_err(|e| format!("{}", e))
}

// -- API Proxy commands --

#[tauri::command]
async fn start_api_proxy(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let settings = state.settings.lock().await.get();
    let mut proxy = state.api_proxy.lock().await;
    proxy
        .start(
            settings.api_proxy_port,
            settings.api_proxy_key,
            state.client.clone(),
            state.settings.clone(),
        )
        .await
}

#[tauri::command]
async fn stop_api_proxy(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut proxy = state.api_proxy.lock().await;
    proxy.stop().await;
    Ok(())
}

#[tauri::command]
async fn get_api_proxy_status(state: tauri::State<'_, AppState>) -> Result<ApiProxyStatus, String> {
    let proxy = state.api_proxy.lock().await;
    Ok(proxy.get_status())
}

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    use std::net::UdpSocket;
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip().to_string();
                if !ip.is_empty() && ip != "0.0.0.0" {
                    return Ok(ip);
                }
            }
        }
    }
    Ok("127.0.0.1".to_string())
}

// -- Docker & Hardware Telemetry commands --

#[tauri::command]
async fn get_docker_status() -> Result<crate::docker::DockerStatus, String> {
    Ok(crate::docker::DockerManager::check_status().await)
}

#[tauri::command]
async fn detect_gpu_hardware() -> Result<crate::docker::GpuInfo, String> {
    Ok(crate::docker::DockerManager::detect_gpu().await)
}

// -- Service Orchestrator (16-tool Catalog) commands --

#[tauri::command]
async fn list_recipes(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::recipes::ServiceRecipe>, String> {
    Ok(state.orchestrator.list_recipes())
}

#[tauri::command]
async fn get_service_states(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::recipes::ServiceState>, String> {
    Ok(state.orchestrator.get_all_states().await)
}

#[tauri::command]
async fn install_and_run_service(
    state: tauri::State<'_, AppState>,
    recipe_id: String,
) -> Result<(), String> {
    state.orchestrator.install_and_run(&recipe_id).await
}

#[tauri::command]
async fn stop_service(
    state: tauri::State<'_, AppState>,
    recipe_id: String,
) -> Result<(), String> {
    state.orchestrator.stop_service(&recipe_id).await
}

#[tauri::command]
async fn refresh_service_status(
    state: tauri::State<'_, AppState>,
    recipe_id: String,
) -> Result<crate::recipes::ServiceState, String> {
    state.orchestrator.refresh_status(&recipe_id).await
}

#[tauri::command]
async fn get_service_logs(
    state: tauri::State<'_, AppState>,
    recipe_id: String,
    tail: u32,
) -> Result<String, String> {
    state.orchestrator.get_logs(&recipe_id, tail).await
}

#[tauri::command]
async fn check_service_health(
    endpoint: String,
    timeout_secs: Option<u64>,
) -> Result<bool, String> {
    crate::docker::DockerManager::check_service_health(&endpoint, timeout_secs.unwrap_or(3)).await
}

// -- Multi-User & RBAC commands --

#[tauri::command]
async fn update_peer_role(
    state: tauri::State<'_, AppState>,
    peer_id: String,
    role: String,
    rate_limit_rpm: u32,
) -> Result<(), String> {
    let store = state.peer_store.lock().await;
    let r = crate::peer_store::UserRole::from(role.as_str());
    store.update_role(&peer_id, r, rate_limit_rpm).map_err(|e| format!("{}", e))
}

#[tauri::command]
async fn generate_peer_api_token(
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<String, String> {
    let store = state.peer_store.lock().await;
    store.generate_api_token(&peer_id).map_err(|e| format!("{}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize identity
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let identity = NodeIdentity::load_or_create(Some(&data_dir))
                .expect("Failed to initialize identity");

            // Initialize peer store
            let db_path = data_dir.join("ghostcompute.db");
            let peer_store = PeerStore::open(&db_path).expect("Failed to open peer database");

            // Initialize settings
            let settings_path = data_dir.join("settings.json");
            let settings_store =
                SettingsStore::open(&settings_path).expect("Failed to load settings");

            // Build app state
            let state = AppState {
                identity: Arc::new(identity),
                peer_store: Arc::new(Mutex::new(peer_store)),
                mdns: Arc::new(Mutex::new(None)),
                ollama: Arc::new(Mutex::new(OllamaManager::new())),
                server: Arc::new(Mutex::new(HostServer::new())),
                client: Arc::new(Mutex::new(ClientConnection::new())),
                discovered_peers: Arc::new(Mutex::new(Vec::new())),
                pairing_state: Arc::new(Mutex::new(PairingState::Idle)),
                pairing_code: Arc::new(Mutex::new(None)),
                pairing_link: Arc::new(Mutex::new(None)),
                settings: Arc::new(Mutex::new(settings_store)),
                api_proxy: Arc::new(Mutex::new(ApiProxyHandle::new())),
                orchestrator: Arc::new(crate::orchestrator::Orchestrator::new(data_dir.clone())),
                active_tunnel_url: Arc::new(Mutex::new(None)),
            };
            app.manage(state);

            // Auto-start API proxy if enabled
            let settings_for_proxy = {
                let ss = app.state::<AppState>();
                let store = ss.settings.blocking_lock();
                store.get()
            };
            if settings_for_proxy.api_proxy_enabled {
                let proxy_state = app.state::<AppState>().api_proxy.clone();
                let client_state = app.state::<AppState>().client.clone();
                let port = settings_for_proxy.api_proxy_port;
                let key = settings_for_proxy.api_proxy_key.clone();
                let settings_state = app.state::<AppState>().settings.clone();
                tauri::async_runtime::spawn(async move {
                    let mut proxy = proxy_state.lock().await;
                    if let Err(e) = proxy.start(port, key, client_state, settings_state).await {
                        log::error!("Failed to auto-start API proxy: {}", e);
                    }
                });
            }

            // System tray
            let show_item = MenuItemBuilder::with_id("show", "Open GhostCompute").build(app)?;
            let kill_item = MenuItemBuilder::with_id("kill_all", "Kill All Sessions").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &kill_item, &quit_item])
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GhostCompute")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "kill_all" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(state) = app.try_state::<AppState>() {
                                let mut server = state.server.lock().await;
                                server.stop().await;
                            }
                        });
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Discovery
            get_discovered_peers,
            start_discovery,
            stop_discovery,
            // Pairing
            get_pairing_state,
            initiate_pairing,
            confirm_pairing,
            generate_pairing_code,
            submit_pairing_code,
            generate_pairing_link,
            // Peer management
            get_paired_devices,
            revoke_device,
            remove_device,
            // Host
            start_hosting,
            is_hosting,
            stop_hosting,
            get_active_sessions,
            kill_session,
            kill_all_sessions,
            get_active_tunnel_url,
            start_quick_tunnel,
            // Client
            connect_to_host,
            connect_to_url,
            disconnect_from_host,
            send_chat_message,
            get_connection_status,
            get_available_models,
            get_remote_models,
            // Ollama
            get_ollama_status,
            pull_model,
            swap_model,
            // Identity
            get_identity_info,
            // Settings
            get_settings,
            save_settings,
            // API Proxy
            start_api_proxy,
            stop_api_proxy,
            get_api_proxy_status,
            get_host_sys_stats,
            get_local_ip,
            // Docker & GPU
            get_docker_status,
            detect_gpu_hardware,
            // Orchestrator Catalog
            list_recipes,
            get_service_states,
            install_and_run_service,
            stop_service,
            refresh_service_status,
            get_service_logs,
            check_service_health,
            // RBAC
            update_peer_role,
            generate_peer_api_token,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}
