use crate::docker::DockerManager;
use crate::recipes::{build_catalog, ServiceRecipe, ServiceState, ServiceStatus};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct Orchestrator {
    data_dir: PathBuf,
    recipes: HashMap<String, ServiceRecipe>,
    states: Arc<Mutex<HashMap<String, ServiceState>>>,
}

impl Orchestrator {
    pub fn new(data_dir: PathBuf) -> Self {
        let catalog = build_catalog();
        let mut recipes = HashMap::new();
        let mut states = HashMap::new();

        for recipe in catalog {
            recipes.insert(recipe.id.clone(), recipe.clone());
            states.insert(
                recipe.id.clone(),
                ServiceState {
                    recipe_id: recipe.id.clone(),
                    status: ServiceStatus::NotInstalled,
                    container_id: None,
                    tunnel_url: None,
                    last_health_check: None,
                    error_message: None,
                    installed_at: None,
                    started_at: None,
                },
            );
        }

        Self {
            data_dir,
            recipes,
            states: Arc::new(Mutex::new(states)),
        }
    }

    pub fn list_recipes(&self) -> Vec<ServiceRecipe> {
        let mut list: Vec<ServiceRecipe> = self.recipes.values().cloned().collect();
        list.sort_by(|a, b| a.name.cmp(&b.name));
        list
    }

    pub async fn get_all_states(&self) -> Vec<ServiceState> {
        // Auto-detect if native Ollama or Twinny is currently responding
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(400))
            .build()
            .unwrap_or_default();

        let ollama_up = client
            .get("http://127.0.0.1:11434/api/version")
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
            || client
                .get("http://localhost:11434/api/version")
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

        let mut states = self.states.lock().await;
        if ollama_up {
            if let Some(s) = states.get_mut("ollama") {
                s.status = ServiceStatus::Running;
            }
            if let Some(s) = states.get_mut("twinny") {
                s.status = ServiceStatus::Running;
            }
        }
        states.values().cloned().collect()
    }

    pub async fn get_service_state(&self, recipe_id: &str) -> Option<ServiceState> {
        let states = self.states.lock().await;
        states.get(recipe_id).cloned()
    }

    pub async fn refresh_status(&self, recipe_id: &str) -> Result<ServiceState, String> {
        let recipe = self
            .recipes
            .get(recipe_id)
            .ok_or_else(|| format!("Unknown recipe: {}", recipe_id))?;

        // 1. Native Bare-Metal Binary check (Ollama, LM Studio, Jan, Twinny)
        if recipe.deployment == crate::recipes::DeploymentMethod::NativeBinary {
            let mut states = self.states.lock().await;
            if let Some(state) = states.get_mut(recipe_id) {
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_millis(800))
                    .build()
                    .unwrap_or_default();

                let mut is_up = false;
                if let Some(ref hc) = recipe.health_check {
                    if let Ok(resp) = client.get(&hc.endpoint).send().await {
                        if resp.status().as_u16() == hc.expected_status || resp.status().is_success() {
                            is_up = true;
                        }
                    }
                    if !is_up && hc.endpoint.contains("localhost") {
                        let alt_ep = hc.endpoint.replace("localhost", "127.0.0.1");
                        if let Ok(resp) = client.get(&alt_ep).send().await {
                            if resp.status().as_u16() == hc.expected_status || resp.status().is_success() {
                                is_up = true;
                            }
                        }
                    }
                } else if recipe_id == "ollama" || recipe_id == "twinny" {
                    if let Ok(resp) = client.get("http://127.0.0.1:11434/api/version").send().await {
                        if resp.status().is_success() {
                            is_up = true;
                        }
                    }
                }

                if is_up {
                    state.status = ServiceStatus::Running;
                } else {
                    let installed = is_native_tool_installed(recipe_id).await;
                    if installed {
                        state.status = ServiceStatus::Stopped;
                    } else {
                        state.status = ServiceStatus::NotInstalled;
                    }
                }
                state.last_health_check = Some(chrono::Utc::now().to_rfc3339());
                return Ok(state.clone());
            }
        }

        // 2. Containerized / Docker check
        let container_name = format!("ghostcompute-{}", recipe_id);
        let inspected = DockerManager::inspect_container(&container_name).await?;

        let mut states = self.states.lock().await;
        if let Some(state) = states.get_mut(recipe_id) {
            if let Some(c) = inspected {
                state.container_id = Some(c.id);
                state.status = if c.state == "running" {
                    ServiceStatus::Running
                } else if c.state == "exited" {
                    ServiceStatus::Stopped
                } else {
                    ServiceStatus::Installed
                };
            } else {
                state.status = ServiceStatus::NotInstalled;
                state.container_id = None;
            }
            state.last_health_check = Some(chrono::Utc::now().to_rfc3339());
            return Ok(state.clone());
        }

        Err("Service state missing".to_string())
    }

    pub async fn install_and_run(&self, recipe_id: &str) -> Result<(), String> {
        let recipe = self
            .recipes
            .get(recipe_id)
            .ok_or_else(|| format!("Unknown recipe: {}", recipe_id))?
            .clone();

        {
            let mut states = self.states.lock().await;
            if let Some(state) = states.get_mut(recipe_id) {
                state.status = ServiceStatus::Starting;
                state.error_message = None;
            }
        }

        let service_dir = self.data_dir.join("services").join(&recipe.id);
        tokio::fs::create_dir_all(&service_dir)
            .await
            .map_err(|e| format!("Failed to create service directory: {}", e))?;

        // Prioritize NativeBinary deployment first: highest tok/s, zero Docker/CUDA toolkit hurdles
        if recipe.deployment == crate::recipes::DeploymentMethod::NativeBinary {
            if recipe.id == "ollama" || recipe.id == "twinny" {
                // 1. Is Ollama ALREADY running?
                let client = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_millis(800))
                    .build()
                    .unwrap_or_default();

                let is_running = client
                    .get("http://127.0.0.1:11434/api/version")
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false)
                    || client
                        .get("http://localhost:11434/api/version")
                        .send()
                        .await
                        .map(|r| r.status().is_success())
                        .unwrap_or(false);

                if is_running {
                    log::info!("[Orchestrator] Ollama is already active on port 11434");
                    let mut states = self.states.lock().await;
                    if let Some(state) = states.get_mut(recipe_id) {
                        state.status = ServiceStatus::Running;
                        state.started_at = Some(chrono::Utc::now().to_rfc3339());
                        state.installed_at = Some(chrono::Utc::now().to_rfc3339());
                    }
                    return Ok(());
                }

                // 2. Not running yet - attempt to launch local ollama serve binary
                let mut spawned = false;

                #[cfg(target_os = "windows")]
                {
                    let mut cmd = tokio::process::Command::new("ollama");
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                    cmd.arg("serve").env("OLLAMA_HOST", "0.0.0.0");
                    if cmd.spawn().is_ok() {
                        spawned = true;
                    } else {
                        let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
                        let candidate = format!("{}\\Programs\\Ollama\\ollama.exe", localappdata);
                        if std::path::Path::new(&candidate).exists() {
                            let mut c = tokio::process::Command::new(&candidate);
                            c.creation_flags(0x08000000);
                            c.arg("serve").env("OLLAMA_HOST", "0.0.0.0");
                            spawned = c.spawn().is_ok();
                        }
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    let mut cmd = tokio::process::Command::new("ollama");
                    cmd.arg("serve").env("OLLAMA_HOST", "0.0.0.0");
                    if cmd.spawn().is_ok() {
                        spawned = true;
                    } else {
                        let candidates = [
                            "/usr/local/bin/ollama",
                            "/usr/bin/ollama",
                            "/bin/ollama",
                            "/opt/homebrew/bin/ollama",
                        ];
                        for cand in candidates {
                            if std::path::Path::new(cand).exists() {
                                let mut c = tokio::process::Command::new(cand);
                                c.arg("serve").env("OLLAMA_HOST", "0.0.0.0");
                                if c.spawn().is_ok() {
                                    spawned = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if spawned {
                    // Poll for up to 6 seconds for Ollama to become ready
                    let mut ready = false;
                    for _ in 0..12 {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        if let Ok(resp) = client.get("http://127.0.0.1:11434/api/version").send().await {
                            if resp.status().is_success() {
                                ready = true;
                                break;
                            }
                        }
                    }
                    if ready {
                        let mut states = self.states.lock().await;
                        if let Some(state) = states.get_mut(recipe_id) {
                            state.status = ServiceStatus::Running;
                            state.started_at = Some(chrono::Utc::now().to_rfc3339());
                            state.installed_at = Some(chrono::Utc::now().to_rfc3339());
                        }
                        return Ok(());
                    }
                }

                // If native Ollama not found, check if Docker is running and has image
                let docker_available = DockerManager::check_status().await.running;
                if !docker_available {
                    let err = "Ollama is installed or configured locally but is not currently running. Please start Ollama Desktop or run 'ollama serve' in terminal.".to_string();
                    let mut states = self.states.lock().await;
                    if let Some(state) = states.get_mut(recipe_id) {
                        state.status = ServiceStatus::Stopped;
                        state.error_message = Some(err.clone());
                    }
                    return Err(err);
                }
            } else if recipe.id == "lm-studio" {
                let _ = tokio::process::Command::new("lms")
                    .args(["server", "start", "--port", "1234"])
                    .spawn();
            }
        }

        // Docker Compose projects (ComfyUI, Dify, Open WebUI with compose, etc.)
        if let Some(ref compose_tmpl) = recipe.compose_template {
            let project_name = format!("ghostcompute-{}", recipe.id);
            if let Err(e) = DockerManager::compose_up(&project_name, compose_tmpl, &service_dir).await {
                let mut states = self.states.lock().await;
                if let Some(state) = states.get_mut(recipe_id) {
                    state.status = ServiceStatus::Error;
                    state.error_message = Some(e.clone());
                }
                return Err(e);
            }
        } else if let Some(ref image) = recipe.docker_image {
            // Docker single container fallback
            let container_name = format!("ghostcompute-{}", recipe.id);
            let mut cmd = tokio::process::Command::new("docker");
            cmd.args(["run", "-d", "--name", &container_name]);

            for p in &recipe.ports {
                cmd.args(["-p", &format!("{}:{}", p.host_port, p.container_port)]);
            }

            for v in &recipe.volumes {
                let host_p = service_dir.join(&v.host_path);
                let _ = tokio::fs::create_dir_all(&host_p).await;
                cmd.args(["-v", &format!("{}:{}", host_p.display(), v.container_path)]);
            }

            for env in &recipe.env_vars {
                cmd.args(["-e", &format!("{}={}", env.key, env.default_value)]);
            }

            if recipe.gpu.nvidia_runtime {
                cmd.args(["--gpus", "all"]);
            }

            cmd.arg(image);

            let output = cmd.output().await.map_err(|e| format!("Failed to run docker: {}", e))?;
            if !output.status.success() {
                let err = String::from_utf8_lossy(&output.stderr).to_string();
                let mut states = self.states.lock().await;
                if let Some(state) = states.get_mut(recipe_id) {
                    state.status = ServiceStatus::Error;
                    state.error_message = Some(err.clone());
                }
                return Err(err);
            }
        }

        let mut states = self.states.lock().await;
        if let Some(state) = states.get_mut(recipe_id) {
            state.status = ServiceStatus::Running;
            state.started_at = Some(chrono::Utc::now().to_rfc3339());
            state.installed_at = Some(chrono::Utc::now().to_rfc3339());
        }

        Ok(())
    }

    pub async fn stop_service(&self, recipe_id: &str) -> Result<(), String> {
        let recipe = self
            .recipes
            .get(recipe_id)
            .ok_or_else(|| format!("Unknown recipe: {}", recipe_id))?;

        let service_dir = self.data_dir.join("services").join(&recipe.id);
        let project_name = format!("ghostcompute-{}", recipe.id);
        let container_name = format!("ghostcompute-{}", recipe.id);

        if recipe.deployment == crate::recipes::DeploymentMethod::NativeBinary {
            // For native binaries like Ollama or LM Studio, mark as stopped
            let mut states = self.states.lock().await;
            if let Some(state) = states.get_mut(recipe_id) {
                state.status = ServiceStatus::Stopped;
            }
            return Ok(());
        }

        if recipe.compose_template.is_some() {
            let _ = DockerManager::compose_down(&project_name, &service_dir).await;
        } else {
            let _ = DockerManager::stop_container(&container_name).await;
        }

        let mut states = self.states.lock().await;
        if let Some(state) = states.get_mut(recipe_id) {
            state.status = ServiceStatus::Stopped;
        }

        Ok(())
    }

    pub async fn get_logs(&self, recipe_id: &str, tail: u32) -> Result<String, String> {
        let recipe = self.recipes.get(recipe_id);
        if let Some(r) = recipe {
            if r.deployment == crate::recipes::DeploymentMethod::NativeBinary {
                return Ok(format!("[GhostCompute] {} runs as a native system service. Consult system/terminal logs or launch console.", r.name));
            }
        }
        let container_name = format!("ghostcompute-{}", recipe_id);
        DockerManager::container_logs(&container_name, tail).await
    }
}

async fn is_native_tool_installed(tool_id: &str) -> bool {
    match tool_id {
        "ollama" | "twinny" => {
            if tokio::process::Command::new("ollama")
                .arg("--version")
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false)
            {
                return true;
            }

            #[cfg(target_os = "windows")]
            {
                let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
                let programfiles = std::env::var("ProgramFiles").unwrap_or_default();
                let candidates = [
                    format!("{}\\Programs\\Ollama\\ollama.exe", localappdata),
                    format!("{}\\Ollama\\ollama.exe", programfiles),
                ];
                if candidates.iter().any(|p| std::path::Path::new(p).exists()) {
                    return true;
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                let candidates = [
                    "/usr/local/bin/ollama",
                    "/usr/bin/ollama",
                    "/bin/ollama",
                    "/opt/homebrew/bin/ollama",
                ];
                if candidates.iter().any(|p| std::path::Path::new(p).exists()) {
                    return true;
                }
                if let Ok(home) = std::env::var("HOME") {
                    let local_bin = format!("{}/.local/bin/ollama", home);
                    if std::path::Path::new(&local_bin).exists() {
                        return true;
                    }
                }
            }
            false
        }
        "lm-studio" => {
            tokio::process::Command::new("lms")
                .arg("version")
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
        "jan" => {
            #[cfg(target_os = "macos")]
            return std::path::Path::new("/Applications/Jan.app").exists();
            #[cfg(not(target_os = "macos"))]
            false
        }
        _ => false,
    }
}
