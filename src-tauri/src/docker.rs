use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerStatus {
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub compose_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,  // "running", "exited", "created", etc.
    pub status: String,  // Human-readable status like "Up 2 hours"
    pub ports: Vec<PortMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub container_port: u16,
    pub host_port: Option<u16>,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: String,       // "nvidia", "amd", "apple", "none"
    pub name: String,         // e.g. "NVIDIA GeForce RTX 4090"
    pub vram_mb: u64,
    pub driver_version: Option<String>,
    pub cuda_version: Option<String>,
    pub nvidia_docker: bool,  // nvidia-container-toolkit installed
}

pub struct DockerManager;

impl DockerManager {
    /// Check if Docker is installed and running
    pub async fn check_status() -> DockerStatus {
        let version_output = Command::new("docker")
            .args(["version", "--format", "{{.Server.Version}}"]) 
            .output()
            .await;

        let (installed, running, version) = match version_output {
            Ok(output) if output.status.success() => {
                let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
                (true, true, Some(ver))
            }
            Ok(output) => {
                // Docker installed but daemon not running
                let stderr = String::from_utf8_lossy(&output.stderr);
                let is_installed = !stderr.contains("not found");
                (is_installed, false, None)
            }
            Err(_) => (false, false, None),
        };

        let compose_output = Command::new("docker")
            .args(["compose", "version"])
            .output()
            .await;
        let compose_available = compose_output.map(|o| o.status.success()).unwrap_or(false);

        DockerStatus {
            installed,
            running,
            version,
            compose_available,
        }
    }

    /// Detect GPU hardware
    pub async fn detect_gpu() -> GpuInfo {
        // Try NVIDIA first
        if let Ok(output) = Command::new("nvidia-smi")
            .args(["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
            .output()
            .await
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let line = stdout.trim();
                let parts: Vec<&str> = line.splitn(3, ',').map(|s| s.trim()).collect();
                
                let name = parts.first().unwrap_or(&"NVIDIA GPU").to_string();
                let vram_mb = parts.get(1)
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                let driver_version = parts.get(2).map(|s| s.to_string());

                // Check CUDA version
                let cuda_version = Command::new("nvidia-smi")
                    .args(["--query-gpu=compute_cap", "--format=csv,noheader"])
                    .output()
                    .await
                    .ok()
                    .and_then(|o| {
                        if o.status.success() {
                            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                        } else {
                            None
                        }
                    });

                // Check nvidia-container-toolkit
                let nvidia_docker = Command::new("nvidia-container-cli")
                    .arg("--version")
                    .output()
                    .await
                    .map(|o| o.status.success())
                    .unwrap_or(false);

                return GpuInfo {
                    vendor: "nvidia".to_string(),
                    name,
                    vram_mb,
                    driver_version,
                    cuda_version,
                    nvidia_docker,
                };
            }
        }

        // Try AMD ROCm
        if let Ok(output) = Command::new("rocm-smi")
            .args(["--showproductname", "--showmeminfo", "vram", "--csv"])
            .output()
            .await
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return GpuInfo {
                    vendor: "amd".to_string(),
                    name: stdout.lines().nth(1).unwrap_or("AMD GPU").trim().to_string(),
                    vram_mb: 0, // Parse from CSV if needed
                    driver_version: None,
                    cuda_version: None,
                    nvidia_docker: false,
                };
            }
        }

        // Check for Apple Metal (macOS)
        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("system_profiler")
                .args(["SPDisplaysDataType", "-json"])
                .output()
                .await
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                        if let Some(displays) = val.get("SPDisplaysDataType").and_then(|d| d.as_array()) {
                            if let Some(gpu) = displays.first() {
                                let name = gpu.get("sppci_model").and_then(|n| n.as_str()).unwrap_or("Apple GPU").to_string();
                                let vram_str = gpu.get("spdisplays_vram").and_then(|v| v.as_str()).unwrap_or("0");
                                let vram_mb = vram_str.split_whitespace().next()
                                    .and_then(|s| s.parse::<u64>().ok())
                                    .unwrap_or(0);
                                return GpuInfo {
                                    vendor: "apple".to_string(),
                                    name,
                                    vram_mb,
                                    driver_version: None,
                                    cuda_version: None,
                                    nvidia_docker: false,
                                };
                            }
                        }
                    }
                }
            }
        }

        GpuInfo {
            vendor: "none".to_string(),
            name: "No GPU detected".to_string(),
            vram_mb: 0,
            driver_version: None,
            cuda_version: None,
            nvidia_docker: false,
        }
    }

    /// List all containers (running and stopped)
    pub async fn list_containers() -> Result<Vec<ContainerInfo>, String> {
        let output = Command::new("docker")
            .args(["ps", "-a", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Ports}}"])
            .output()
            .await
            .map_err(|e| format!("Failed to run docker ps: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let containers: Vec<ContainerInfo> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.splitn(6, '\t').collect();
                ContainerInfo {
                    id: parts.first().unwrap_or(&"").to_string(),
                    name: parts.get(1).unwrap_or(&"").to_string(),
                    image: parts.get(2).unwrap_or(&"").to_string(),
                    state: parts.get(3).unwrap_or(&"").to_string(),
                    status: parts.get(4).unwrap_or(&"").to_string(),
                    ports: Self::parse_ports(parts.get(5).unwrap_or(&"")),
                }
            })
            .collect();

        Ok(containers)
    }

    /// Parse Docker port mapping string like "0.0.0.0:8080->80/tcp"
    fn parse_ports(port_str: &str) -> Vec<PortMapping> {
        port_str
            .split(',')
            .filter(|s| !s.trim().is_empty())
            .filter_map(|s| {
                let s = s.trim();
                // Format: "0.0.0.0:8080->80/tcp" or "80/tcp"
                if let Some(arrow_pos) = s.find("->") {
                    let host_part = &s[..arrow_pos];
                    let container_part = &s[arrow_pos + 2..];
                    
                    let host_port = host_part
                        .rsplit(':')
                        .next()
                        .and_then(|p| p.parse::<u16>().ok());
                    
                    let (container_port, protocol) = if let Some(slash) = container_part.find('/') {
                        (
                            container_part[..slash].parse::<u16>().ok()?,
                            container_part[slash + 1..].to_string(),
                        )
                    } else {
                        (container_part.parse::<u16>().ok()?, "tcp".to_string())
                    };
                    
                    Some(PortMapping {
                        container_port,
                        host_port,
                        protocol,
                    })
                } else if let Some(slash) = s.find('/') {
                    Some(PortMapping {
                        container_port: s[..slash].parse::<u16>().ok()?,
                        host_port: None,
                        protocol: s[slash + 1..].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect()
    }

    /// Start a container by name or ID
    pub async fn start_container(name_or_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["start", name_or_id])
            .output()
            .await
            .map_err(|e| format!("Failed to start container: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Stop a container by name or ID
    pub async fn stop_container(name_or_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["stop", name_or_id])
            .output()
            .await
            .map_err(|e| format!("Failed to stop container: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Remove a container by name or ID
    pub async fn remove_container(name_or_id: &str, force: bool) -> Result<(), String> {
        let mut args = vec!["rm"];
        if force {
            args.push("-f");
        }
        args.push(name_or_id);

        let output = Command::new("docker")
            .args(&args)
            .output()
            .await
            .map_err(|e| format!("Failed to remove container: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        Ok(())
    }

    /// Pull a Docker image
    pub async fn pull_image(image: &str) -> Result<tokio::sync::mpsc::Receiver<String>, String> {
        let (tx, rx) = tokio::sync::mpsc::channel::<String>(100);
        let image = image.to_string();

        tokio::spawn(async move {
            let mut child = match Command::new("docker")
                .args(["pull", &image])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(e) => {
                    let _ = tx.send(format!("Error: {}", e)).await;
                    return;
                }
            };

            // Read stdout line by line
            if let Some(stdout) = child.stdout.take() {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if tx.send(line).await.is_err() {
                        break;
                    }
                }
            }

            let _ = child.wait().await;
        });

        Ok(rx)
    }

    /// Run a Docker Compose project from a given compose file content
    pub async fn compose_up(
        project_name: &str,
        compose_content: &str,
        work_dir: &std::path::Path,
    ) -> Result<(), String> {
        // Write compose file
        let compose_path = work_dir.join("docker-compose.yml");
        tokio::fs::write(&compose_path, compose_content)
            .await
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        let output = Command::new("docker")
            .args(["compose", "-p", project_name, "-f"])
            .arg(&compose_path)
            .args(["up", "-d"])
            .current_dir(work_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to run docker compose: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Docker compose failed: {}", stderr));
        }
        Ok(())
    }

    /// Stop a Docker Compose project
    pub async fn compose_down(
        project_name: &str,
        work_dir: &std::path::Path,
    ) -> Result<(), String> {
        let compose_path = work_dir.join("docker-compose.yml");
        let output = Command::new("docker")
            .args(["compose", "-p", project_name, "-f"])
            .arg(&compose_path)
            .arg("down")
            .current_dir(work_dir)
            .output()
            .await
            .map_err(|e| format!("Failed to run docker compose down: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Docker compose down failed: {}", stderr));
        }
        Ok(())
    }

    /// Get container logs
    pub async fn container_logs(name_or_id: &str, tail: u32) -> Result<String, String> {
        let output = Command::new("docker")
            .args(["logs", "--tail", &tail.to_string(), name_or_id])
            .output()
            .await
            .map_err(|e| format!("Failed to get logs: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Ok(format!("{}{}", stdout, stderr))
    }

    /// Check if a specific container exists and get its status
    pub async fn inspect_container(name_or_id: &str) -> Result<Option<ContainerInfo>, String> {
        let output = Command::new("docker")
            .args(["inspect", "--format", "{{.Id}}\t{{.Name}}\t{{.Config.Image}}\t{{.State.Status}}\t{{.State.Status}}", name_or_id])
            .output()
            .await
            .map_err(|e| format!("Failed to inspect container: {}", e))?;

        if !output.status.success() {
            return Ok(None);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout.trim();
        let parts: Vec<&str> = line.splitn(5, '\t').collect();
        
        Ok(Some(ContainerInfo {
            id: parts.first().unwrap_or(&"").to_string(),
            name: parts.get(1).unwrap_or(&"").trim_start_matches('/').to_string(),
            image: parts.get(2).unwrap_or(&"").to_string(),
            state: parts.get(3).unwrap_or(&"").to_string(),
            status: parts.get(4).unwrap_or(&"").to_string(),
            ports: vec![],
        }))
    }

    /// Check if cloudflared binary is available
    pub async fn check_cloudflared() -> Option<String> {
        let output = Command::new("cloudflared")
            .arg("version")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            None
        }
    }

    /// Perform HTTP health check against a service endpoint
    pub async fn check_service_health(endpoint: &str, timeout_secs: u64) -> Result<bool, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .build()
            .map_err(|e| format!("Client build failed: {}", e))?;

        let res = client.get(endpoint).send().await;
        match res {
            Ok(resp) => Ok(resp.status().is_success() || resp.status().as_u16() == 401 || resp.status().as_u16() == 403),
            Err(e) => Err(format!("Health check error: {}", e)),
        }
    }
}
