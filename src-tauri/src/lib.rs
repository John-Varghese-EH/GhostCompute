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
async fn start_discovery(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mdns_lock = state.mdns.lock().await;
    if mdns_lock.is_none() {
        let handle = MdnsHandle::new().map_err(|e| format!("{}", e))?;
        *mdns_lock = Some(handle);
    }

    let mdns = mdns_lock.as_mut().ok_or("mDNS not initialized")?;
    let own_id = state.identity.peer_id();
    let mut rx = mdns.browse_peers(own_id).map_err(|e| format!("{}", e))?;

    let peers = state.discovered_peers.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            let mut peer_list = peers.lock().await;
            match event {
                discovery::DiscoveryEvent::PeerFound(peer) => {
                    if !peer_list.iter().any(|p| p.peer_id == peer.peer_id) {
                        peer_list.push(peer);
                    }
                }
                discovery::DiscoveryEvent::PeerLost(id) => {
                    peer_list.retain(|p| p.peer_id != id);
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_discovery(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mdns_lock = state.mdns.lock().await;
    if let Some(handle) = mdns_lock.take() {
        handle.shutdown().map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

// -- Pairing commands --

#[tauri::command]
async fn get_pairing_state(state: tauri::State<'_, AppState>) -> Result<PairingState, String> {
    let s = state.pairing_state.lock().await;
    Ok(s.clone())
}

#[tauri::command]
async fn initiate_pairing(
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

    let address = peer
        .addresses
        .first()
        .ok_or_else(|| "No address available for peer".to_string())?;

    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    client
        .connect(noise_priv, &peer_id, address, peer.port)
        .await
        .map_err(|e| format!("{}", e))?;

    let payload = serde_json::json!({
        "action": "pair"
    });
    let resp_bytes = client
        .send_request(&serde_json::to_vec(&payload).unwrap())
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
            return Ok(());
        }
    } else if resp.get("action").and_then(|a| a.as_str()) == Some("pair_ok") {
        let store = state.peer_store.lock().await;
        store
            .add_peer(&peer_id, &peer.device_name, &peer_id)
            .map_err(|e| format!("{}", e))?;
        let mut ps = state.pairing_state.lock().await;
        *ps = crate::pairing::PairingState::Completed { peer_id };
        return Ok(());
    }

    let mut ps = state.pairing_state.lock().await;
    *ps = crate::pairing::PairingState::Failed {
        reason: "Pairing failed".into(),
    };
    Err("Pairing failed".into())
}

#[tauri::command]
async fn confirm_pairing(state: tauri::State<'_, AppState>, confirmed: bool) -> Result<(), String> {
    let mut ps = state.pairing_state.lock().await;
    if !confirmed {
        *ps = PairingState::Failed {
            reason: "Pairing rejected by user".to_string(),
        };
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
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<bool, String> {
    let peers = state.discovered_peers.lock().await.clone();

    for peer in peers {
        if let Some(address) = peer.addresses.first() {
            let mut client = state.client.lock().await;
            let noise_priv = state.identity.noise_private;
            if client
                .connect(noise_priv, &peer.peer_id, address, peer.port)
                .await
                .is_ok()
            {
                let payload = serde_json::json!({
                    "action": "pair",
                    "code": code
                });
                if let Ok(resp_bytes) = client
                    .send_request(&serde_json::to_vec(&payload).unwrap())
                    .await
                {
                    if let Ok(resp) = serde_json::from_slice::<serde_json::Value>(&resp_bytes) {
                        if resp.get("action").and_then(|a| a.as_str()) == Some("pair_ok") {
                            let store = state.peer_store.lock().await;
                            let _ = store.add_peer(&peer.peer_id, &peer.device_name, &peer.peer_id);
                            let mut ps = state.pairing_state.lock().await;
                            *ps = crate::pairing::PairingState::Completed {
                                peer_id: peer.peer_id.clone(),
                            };
                            return Ok(true);
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
    Ok(false)
}

#[tauri::command]
async fn generate_pairing_link(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let link = pairing::generate_pairing_link();
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
    cf_token: Option<String>,
) -> Result<(), String> {
    let mut server = state.server.lock().await;
    let peer_store = state.peer_store.clone();
    let noise_priv = state.identity.noise_private;
    let settings = state.settings.lock().await.get();
    let gate = Arc::new(crate::admission::AdmissionGate::new(&settings));

    server
        .start(
            noise_priv,
            crate::discovery::DEFAULT_PORT,
            peer_store,
            cf_token,
            gate,
            app,
        )
        .await
        .map_err(|e| format!("{}", e))?;

    Ok(())
}

#[tauri::command]
async fn stop_hosting(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut server = state.server.lock().await;
    server.stop().await;

    let mut mdns_lock = state.mdns.lock().await;
    if let Some(mdns) = mdns_lock.as_mut() {
        let _ = mdns.stop_advertising();
    }

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

// -- Client commands --

#[tauri::command]
async fn connect_to_host(state: tauri::State<'_, AppState>, peer_id: String) -> Result<(), String> {
    let peers = state.discovered_peers.lock().await;
    let peer = peers
        .iter()
        .find(|p| p.peer_id == peer_id)
        .ok_or_else(|| "Peer not found".to_string())?;

    let address = peer
        .addresses
        .first()
        .ok_or_else(|| "No address available for peer".to_string())?;

    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    client
        .connect(noise_priv, &peer_id, address, peer.port)
        .await
        .map_err(|e| format!("{}", e))
}

#[tauri::command]
async fn connect_to_url(state: tauri::State<'_, AppState>, url: String) -> Result<(), String> {
    let mut client = state.client.lock().await;
    let noise_priv = state.identity.noise_private;
    client
        .connect_url(noise_priv, &url)
        .await
        .map_err(|e| format!("{}", e))
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
) -> Result<Vec<serde_json::Value>, String> {
    let mut client = state.client.lock().await;
    client
        .get_remote_models()
        .await
        .map_err(|e| format!("{}", e))
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
async fn swap_model(_state: tauri::State<'_, AppState>, _name: String) -> Result<(), String> {
    // Model swapping will be implemented when the server handles model loading.
    // Ollama handles this internally when a different model is requested in /api/chat.
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
                tauri::async_runtime::spawn(async move {
                    let mut proxy = proxy_state.lock().await;
                    if let Err(e) = proxy.start(port, key, client_state).await {
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
            stop_hosting,
            get_active_sessions,
            kill_session,
            kill_all_sessions,
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
        ])
        .run(tauri::generate_context!())
        .expect("failed to run application");
}
