import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

old_kill = r"#\[tauri::command\]\nasync fn kill_session\(state: tauri::State<'_, AppState>, _peer_id: String\) -> Result<\(\), String> \{\n[\s\S]*?Ok\(\(\)\)\n\}"
new_kill = """#[tauri::command]
async fn kill_session(state: tauri::State<'_, AppState>, peer_id: String) -> Result<(), String> {
    let server = state.server.lock().await;
    server.kill_session(&peer_id).await;
    Ok(())
}"""

content = re.sub(old_kill, new_kill, content)

with open('src/lib.rs', 'w') as f:
    f.write(content)
