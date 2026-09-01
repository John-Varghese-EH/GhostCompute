use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

fn default_host_port() -> u16 {
    8384
}
fn default_max_concurrent_requests() -> u8 {
    4
}
fn default_max_payload_bytes() -> usize {
    1024 * 1024
}
fn default_max_context_tokens() -> u32 {
    4096
}
fn default_api_proxy_port() -> u16 {
    8787
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub cloudflare_token: Option<String>,
    #[serde(default = "default_host_port")]
    pub host_port: u16,
    #[serde(default)]
    pub auto_start_hosting: bool,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default = "default_max_concurrent_requests")]
    pub max_concurrent_requests: u8,
    #[serde(default = "default_max_payload_bytes")]
    pub max_payload_bytes: usize,
    #[serde(default = "default_max_context_tokens")]
    pub max_context_tokens: u32,
    #[serde(default)]
    pub compression_enabled: bool,
    #[serde(default)]
    pub strip_credentials: bool,
    #[serde(default)]
    pub api_proxy_enabled: bool,
    #[serde(default = "default_api_proxy_port")]
    pub api_proxy_port: u16,
    #[serde(default)]
    pub api_proxy_key: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            cloudflare_token: None,
            host_port: default_host_port(),
            auto_start_hosting: false,
            default_model: None,
            max_concurrent_requests: default_max_concurrent_requests(),
            max_payload_bytes: default_max_payload_bytes(),
            max_context_tokens: default_max_context_tokens(),
            compression_enabled: false,
            strip_credentials: false,
            api_proxy_enabled: false,
            api_proxy_port: default_api_proxy_port(),
            api_proxy_key: None,
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    settings: AppSettings,
}

impl SettingsStore {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, SettingsError> {
        let path = path.as_ref().to_path_buf();
        let settings = if path.exists() {
            let data = fs::read_to_string(&path)?;
            serde_json::from_str(&data)?
        } else {
            let default_settings = AppSettings::default();
            let data = serde_json::to_string_pretty(&default_settings)?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&path, data)?;
            default_settings
        };

        Ok(Self { path, settings })
    }

    pub fn get(&self) -> AppSettings {
        self.settings.clone()
    }

    pub fn save(&mut self, new_settings: AppSettings) -> Result<(), SettingsError> {
        self.settings = new_settings;
        let data = serde_json::to_string_pretty(&self.settings)?;
        fs::write(&self.path, data)?;
        Ok(())
    }
}
