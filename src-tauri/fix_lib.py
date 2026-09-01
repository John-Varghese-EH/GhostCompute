import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Fix kill_all_sessions
bad_kill = r"""#\[tauri::command\]\nasync fn kill_all_sessions\(state: tauri::State<'_, AppState>\) -> Result<\(\), String> \{\n    let settings = state.settings.lock\(\).await.get\(\);\n    let gate = Arc::new\(AdmissionGate::new\(&settings\)\);\n    let mut server = state.server.lock\(\).await;"""
good_kill = """#[tauri::command]
async fn kill_all_sessions(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut server = state.server.lock().await;"""
content = re.sub(bad_kill, good_kill, content)

# Fix stop_hosting
bad_stop = r"""#\[tauri::command\]\nasync fn stop_hosting\(state: tauri::State<'_, AppState>\) -> Result<\(\), String> \{\n    let settings = state.settings.lock\(\).await.get\(\);\n    let gate = Arc::new\(AdmissionGate::new\(&settings\)\);\n    let mut server = state.server.lock\(\).await;"""
good_stop = """#[tauri::command]
async fn stop_hosting(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut server = state.server.lock().await;"""
content = re.sub(bad_stop, good_stop, content)

# Fix kill_all in tray icon event?
# Let's check for any remaining bad matches
content = re.sub(r"let settings = state.settings.lock\(\).await.get\(\);\s+let gate = Arc::new\(AdmissionGate::new\(&settings\)\);\s+let mut server = state.server.lock\(\).await;", "let mut server = state.server.lock().await;", content)
# Put it back for start_hosting
content = re.sub(r"""#\[tauri::command\]\nasync fn start_hosting\(\s*state: tauri::State<'_, AppState>,\s*cf_token: Option<String>,\s*\) -> Result<\(\), String> \{\s*let mut server = state.server.lock\(\).await;""", """#[tauri::command]
async fn start_hosting(
    state: tauri::State<'_, AppState>,
    cf_token: Option<String>,
) -> Result<(), String> {
    let settings = state.settings.lock().await.get();
    let gate = Arc::new(AdmissionGate::new(&settings));
    let mut server = state.server.lock().await;""", content)

with open('src/lib.rs', 'w') as f:
    f.write(content)
