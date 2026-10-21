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
        let states = self.states.lock().await;
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
            } else if recipe.deployment == crate::recipes::DeploymentMethod::NativeBinary {
                if let Some(ref hc) = recipe.health_check {
                    let client = reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(hc.timeout_secs))
                        .build()
                        .unwrap_or_default();
                    if let Ok(resp) = client.get(&hc.endpoint).send().await {
                        if resp.status().as_u16() == hc.expected_status || resp.status().is_success() {
                            state.status = ServiceStatus::Running;
                        } else {
                            state.status = ServiceStatus::Stopped;
                        }
                    } else {
                        state.status = ServiceStatus::NotInstalled;
                    }
                } else if recipe_id == "ollama" || recipe_id == "twinny" {
                    if let Ok(resp) = reqwest::get("http://localhost:11434/api/version").await {
                        if resp.status().is_success() {
                            state.status = ServiceStatus::Running;
                        } else {
                            state.status = ServiceStatus::Stopped;
                        }
                    } else {
                        state.status = ServiceStatus::NotInstalled;
                    }
                }
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
            let container_name = format!("ghostcompute-{}", recipe.id);
            // Single container docker run fallback
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
        } else if recipe.deployment == crate::recipes::DeploymentMethod::NativeBinary {
            // For native bare-metal binaries (hybrid model): highest tok/s, zero Docker/CUDA toolkit hurdles
            if recipe.id == "ollama" || recipe.id == "twinny" {
                let _ = tokio::process::Command::new("ollama")
                    .arg("serve")
                    .env("OLLAMA_HOST", "0.0.0.0")
                    .spawn();
            } else if recipe.id == "comfyui" {
                // Try python main.py in service dir or system comfyui
                let comfy_dir = service_dir.join("ComfyUI");
                let script_path = if comfy_dir.exists() {
                    comfy_dir.join("main.py")
                } else {
                    service_dir.join("main.py")
                };
                let mut cmd = tokio::process::Command::new("python3");
                cmd.args(["-u", script_path.to_str().unwrap_or("main.py"), "--listen", "0.0.0.0", "--port", "8188"]);
                let _ = cmd.spawn();
            } else if recipe.id == "lm-studio" {
                let _ = tokio::process::Command::new("lms")
                    .args(["server", "start", "--port", "1234"])
                    .spawn();
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
        let container_name = format!("ghostcompute-{}", recipe_id);
        DockerManager::container_logs(&container_name, tail).await
    }
}
