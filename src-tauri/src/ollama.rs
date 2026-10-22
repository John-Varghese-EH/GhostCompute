use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use thiserror::Error;
use tokio::process::{Child, Command};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tokio::sync::mpsc;

#[derive(Error, Debug)]
pub enum OllamaError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Ollama not running")]
    NotRunning,
    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),
    #[error("Parse error: {0}")]
    ParseError(String),
}

#[derive(Serialize, Clone, Debug)]
pub enum OllamaStatus {
    NotInstalled,
    Stopped,
    Running,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
}

#[derive(Deserialize, Clone, Debug, Serialize)]
pub struct ChatChunk {
    pub message: Option<ChatMessage>,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PullProgress {
    pub status: String,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

#[derive(Deserialize)]
struct ListModelsResponse {
    models: Vec<ModelInfo>,
}

pub struct OllamaManager {
    pub base_url: String,
    pub process_handle: Option<Child>,
    pub managed: bool,
    client: reqwest::Client,
}

impl OllamaManager {
    pub fn new() -> Self {
        Self {
            base_url: "http://127.0.0.1:11434".to_string(),
            process_handle: None,
            managed: false,
            client: reqwest::Client::new(),
        }
    }

    pub async fn check_status(&self) -> OllamaStatus {
        // Check if Ollama is already running on 127.0.0.1 or localhost (covers Ollama Desktop, system service, etc.)
        let endpoints = [
            format!("{}/api/tags", self.base_url),
            "http://127.0.0.1:11434/api/tags".to_string(),
            "http://localhost:11434/api/tags".to_string(),
        ];

        for ep in &endpoints {
            if let Ok(res) = self
                .client
                .get(ep)
                .timeout(Duration::from_millis(800))
                .send()
                .await
            {
                if res.status().is_success() {
                    return OllamaStatus::Running;
                }
            }
        }

        // Platform-aware binary detection
        #[cfg(target_os = "windows")]
        let detect = Command::new("where").arg("ollama").output().await;
        #[cfg(not(target_os = "windows"))]
        let detect = Command::new("which").arg("ollama").output().await;

        let binary_found = detect.map(|o| o.status.success()).unwrap_or(false);

        if !binary_found {
            // On Windows, check common install locations
            #[cfg(target_os = "windows")]
            {
                let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
                let programfiles = std::env::var("ProgramFiles").unwrap_or_default();
                let candidates = [
                    format!("{}\\Programs\\Ollama\\ollama.exe", localappdata),
                    format!("{}\\Ollama\\ollama.exe", programfiles),
                ];
                if candidates.iter().any(|p| std::path::Path::new(p).exists()) {
                    return OllamaStatus::Stopped;
                }
            }

            // On macOS, check the app bundle and homebrew locations
            #[cfg(target_os = "macos")]
            {
                let candidates = [
                    "/Applications/Ollama.app",
                    "/usr/local/bin/ollama",
                    "/opt/homebrew/bin/ollama",
                ];
                if candidates.iter().any(|p| std::path::Path::new(p).exists()) {
                    return OllamaStatus::Stopped;
                }
            }

            // On Linux, check standard bin directories
            #[cfg(target_os = "linux")]
            {
                let candidates = [
                    "/usr/local/bin/ollama",
                    "/usr/bin/ollama",
                    "/bin/ollama",
                ];
                if candidates.iter().any(|p| std::path::Path::new(p).exists()) {
                    return OllamaStatus::Stopped;
                }
                if let Ok(home) = std::env::var("HOME") {
                    let local_bin = format!("{}/.local/bin/ollama", home);
                    if std::path::Path::new(&local_bin).exists() {
                        return OllamaStatus::Stopped;
                    }
                }
            }

            return OllamaStatus::NotInstalled;
        }

        OllamaStatus::Stopped
    }

    pub async fn ensure_running(&mut self) -> Result<(), OllamaError> {
        match self.check_status().await {
            OllamaStatus::Running => return Ok(()),
            OllamaStatus::NotInstalled => {
                return Err(OllamaError::SpawnFailed("Ollama not installed".to_string()))
            }
            OllamaStatus::Stopped => {}
        }

        // Platform-aware Ollama launch
        #[cfg(target_os = "windows")]
        let mut child_opt = {
            let mut cmd = Command::new("ollama");
            cmd.arg("serve")
                .creation_flags(0x08000000)
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            cmd.spawn().ok()
        };
        #[cfg(target_os = "windows")]
        if child_opt.is_none() {
            let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
            let candidate = format!("{}\\Programs\\Ollama\\ollama.exe", localappdata);
            if std::path::Path::new(&candidate).exists() {
                let mut cmd = Command::new(&candidate);
                cmd.arg("serve")
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                child_opt = cmd.spawn().ok();
            }
        }

        #[cfg(not(target_os = "windows"))]
        let mut child_opt = {
            let mut cmd = Command::new("ollama");
            cmd.arg("serve")
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            cmd.spawn().ok()
        };
        #[cfg(not(target_os = "windows"))]
        if child_opt.is_none() {
            let candidates = ["/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama"];
            for cand in candidates {
                if std::path::Path::new(cand).exists() {
                    let mut cmd = Command::new(cand);
                    cmd.arg("serve")
                        .stdout(Stdio::null())
                        .stderr(Stdio::null());
                    if let Ok(c) = cmd.spawn() {
                        child_opt = Some(c);
                        break;
                    }
                }
            }
        }

        let child = child_opt.ok_or_else(|| OllamaError::SpawnFailed("Failed to spawn ollama process".to_string()))?;

        self.process_handle = Some(child);
        self.managed = true;

        // Wait for Ollama to become responsive (up to 15 seconds)
        for _ in 0..15 {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if let Ok(res) = self
                .client
                .get(format!("{}/api/tags", self.base_url))
                .timeout(Duration::from_secs(2))
                .send()
                .await
            {
                if res.status().is_success() {
                    return Ok(());
                }
            }
        }

        Err(OllamaError::SpawnFailed(
            "Ollama failed to start in time".to_string(),
        ))
    }

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, OllamaError> {
        let res = self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await?;

        let data: ListModelsResponse = res.json().await?;
        Ok(data.models)
    }

    pub async fn pull_model(
        &self,
        name: &str,
    ) -> Result<mpsc::Receiver<PullProgress>, OllamaError> {
        let body = serde_json::json!({
            "name": name,
            "stream": true
        });

        let mut res = self
            .client
            .post(format!("{}/api/pull", self.base_url))
            .json(&body)
            .send()
            .await?;

        let (tx, rx) = mpsc::channel(100);

        tokio::spawn(async move {
            let mut buffer = String::new();
            while let Ok(Some(chunk)) = res.chunk().await {
                if let Ok(text) = std::str::from_utf8(&chunk) {
                    buffer.push_str(text);
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].to_string();
                        buffer = buffer[newline_pos + 1..].to_string();
                        if line.trim().is_empty() {
                            continue;
                        }
                        if let Ok(progress) = serde_json::from_str::<PullProgress>(&line) {
                            if tx.send(progress).await.is_err() {
                                return;
                            }
                        }
                    }
                }
            }
        });

        Ok(rx)
    }

    pub async fn chat(
        &self,
        request: ChatRequest,
    ) -> Result<mpsc::Receiver<ChatChunk>, OllamaError> {
        let mut res = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .json(&request)
            .send()
            .await?;

        let (tx, rx) = mpsc::channel(100);

        tokio::spawn(async move {
            let mut buffer = String::new();
            while let Ok(Some(chunk)) = res.chunk().await {
                if let Ok(text) = std::str::from_utf8(&chunk) {
                    buffer.push_str(text);
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].to_string();
                        buffer = buffer[newline_pos + 1..].to_string();
                        if line.trim().is_empty() {
                            continue;
                        }
                        if let Ok(msg_chunk) = serde_json::from_str::<ChatChunk>(&line) {
                            if tx.send(msg_chunk).await.is_err() {
                                return;
                            }
                        }
                    }
                }
            }
        });

        Ok(rx)
    }

    pub async fn stop(&mut self) -> Result<(), OllamaError> {
        if self.managed {
            if let Some(mut child) = self.process_handle.take() {
                let _ = child.kill().await;
            }
            self.managed = false;
        }
        Ok(())
    }
}

impl Default for OllamaManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn auto_select_model() -> &'static str {
    "llama3.2"
}
