import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Replace send_chat_message
old_send_chat = r"#\[tauri::command\]\nasync fn send_chat_message\([\s\S]*?Ok\(\(\)\)\n\}"
new_send_chat = """#[tauri::command]
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
    })).map_err(|e| format!("{}", e))?;

    let mut client = state.client.lock().await;
    client.send_chat_stream(&payload, app)
        .await
        .map_err(|e| format!("{}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_remote_models(state: tauri::State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let mut client = state.client.lock().await;
    client.get_remote_models().await.map_err(|e| format!("{}", e))
}
"""

content = re.sub(old_send_chat, new_send_chat, content)

# Add get_remote_models to invoke_handler
invoke_handler = r"get_available_models,"
new_invoke = "get_available_models,\n            get_remote_models,"
content = content.replace(invoke_handler, new_invoke)

with open('src/lib.rs', 'w') as f:
    f.write(content)
