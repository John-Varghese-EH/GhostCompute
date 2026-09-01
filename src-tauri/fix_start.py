import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

bad = r"#\[tauri::command\]\nasync fn start_hosting\([\s\S]*?Ok\(\(\)\)\n\}"
good = """#[tauri::command]
async fn start_hosting(
    state: tauri::State<'_, AppState>,
    cf_token: Option<String>,
) -> Result<(), String> {
    let mut server = state.server.lock().await;
    let peer_store = state.peer_store.clone();
    let noise_priv = state.identity.noise_private_key();
    let settings = state.settings.lock().await.get();
    let gate = Arc::new(crate::admission::AdmissionGate::new(&settings));
    
    server.start(noise_priv, crate::discovery::DEFAULT_PORT, peer_store, cf_token, gate)
        .await
        .map_err(|e| format!("{}", e))?;

    Ok(())
}"""

content = re.sub(bad, good, content, count=1)

with open('src/lib.rs', 'w') as f:
    f.write(content)
