use serde::{Deserialize, Serialize};

/// How a service is deployed
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentMethod {
    /// Docker Compose (most tools)
    DockerCompose,
    /// Native binary (Ollama, LM Studio)
    NativeBinary,
    /// Docker single container
    DockerRun,
}

/// Category for the App Store UI
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCategory {
    LlmEngine,
    AiChat,
    MediaGeneration,
    WorkflowAutomation,
    CodingAssistant,
}

impl ToolCategory {
    pub fn label(&self) -> &str {
        match self {
            Self::LlmEngine => "Local LLM Engines & Inference",
            Self::AiChat => "AI Chat, RAG & Knowledge Workspaces",
            Self::MediaGeneration => "Image, Audio & Media Generation",
            Self::WorkflowAutomation => "Workflow Automation & AI Agents",
            Self::CodingAssistant => "Coding Assistants & Vector Databases",
        }
    }

    pub fn icon(&self) -> &str {
        match self {
            Self::LlmEngine => "cpu",
            Self::AiChat => "message-square",
            Self::MediaGeneration => "image",
            Self::WorkflowAutomation => "workflow",
            Self::CodingAssistant => "code",
        }
    }
}

/// A port that a tool exposes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExposedPort {
    pub container_port: u16,
    pub host_port: u16,
    pub protocol: String,
    pub description: String,
}

/// Environment variable for a tool
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub default_value: String,
    pub description: String,
    pub secret: bool,
}

/// A volume mount
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeMount {
    pub host_path: String,  // relative to ghostcompute data dir
    pub container_path: String,
    pub description: String,
}

/// Health check configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub endpoint: String,       // e.g. "http://localhost:8080/health"
    pub method: String,         // GET, HEAD
    pub expected_status: u16,   // 200
    pub interval_secs: u64,
    pub timeout_secs: u64,
}

/// GPU requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuConfig {
    pub required: bool,
    pub recommended_vram_mb: u64,
    pub nvidia_runtime: bool,    // Use --gpus all / nvidia runtime
    pub rocm_support: bool,
}

/// Complete service recipe
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRecipe {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub category: ToolCategory,
    pub deployment: DeploymentMethod,
    pub docker_image: Option<String>,
    pub compose_template: Option<String>,
    pub native_install_url: Option<String>,
    pub ports: Vec<ExposedPort>,
    pub env_vars: Vec<EnvVar>,
    pub volumes: Vec<VolumeMount>,
    pub health_check: Option<HealthCheck>,
    pub gpu: GpuConfig,
    pub depends_on: Vec<String>,  // IDs of other services this depends on
    pub web_ui: bool,             // Has a web dashboard
    pub web_ui_path: Option<String>,  // Path to the web UI (e.g. "/" or "/dashboard")
    pub documentation_url: String,
    pub logo_url: Option<String>,
}

/// Runtime state of a deployed service
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    NotInstalled,
    Installed,
    Starting,
    Running,
    Stopping,
    Stopped,
    Error,
    Updating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceState {
    pub recipe_id: String,
    pub status: ServiceStatus,
    pub container_id: Option<String>,
    pub tunnel_url: Option<String>,
    pub last_health_check: Option<String>,
    pub error_message: Option<String>,
    pub installed_at: Option<String>,
    pub started_at: Option<String>,
}

/// Build the complete catalog of 16 supported tools
pub fn build_catalog() -> Vec<ServiceRecipe> {
    vec![
        // ── Category 1: Local LLM Engines & Inference ──
        ServiceRecipe {
            id: "ollama".into(),
            name: "Ollama".into(),
            description: "Run large language models locally with GPU acceleration. Supports GGUF models with automatic memory management.".into(),
            version: "latest".into(),
            category: ToolCategory::LlmEngine,
            deployment: DeploymentMethod::NativeBinary,
            docker_image: Some("ollama/ollama:latest".into()),
            compose_template: None,
            native_install_url: Some("https://ollama.com/install.sh".into()),
            ports: vec![ExposedPort {
                container_port: 11434,
                host_port: 11434,
                protocol: "tcp".into(),
                description: "Ollama API".into(),
            }],
            env_vars: vec![
                EnvVar { key: "OLLAMA_HOST".into(), default_value: "0.0.0.0".into(), description: "Bind address".into(), secret: false },
                EnvVar { key: "OLLAMA_MODELS".into(), default_value: "/usr/share/ollama/.ollama/models".into(), description: "Model storage path".into(), secret: false },
            ],
            volumes: vec![VolumeMount {
                host_path: "ollama/models".into(),
                container_path: "/root/.ollama".into(),
                description: "Model weights storage".into(),
            }],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:11434/api/version".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 10,
                timeout_secs: 5,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 4096, nvidia_runtime: true, rocm_support: true },
            depends_on: vec![],
            web_ui: false,
            web_ui_path: None,
            documentation_url: "https://ollama.com".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "lm-studio".into(),
            name: "LM Studio".into(),
            description: "Desktop app for discovering, downloading, and running local LLMs with an OpenAI-compatible API server.".into(),
            version: "latest".into(),
            category: ToolCategory::LlmEngine,
            deployment: DeploymentMethod::NativeBinary,
            docker_image: None,
            compose_template: None,
            native_install_url: Some("https://lmstudio.ai".into()),
            ports: vec![ExposedPort {
                container_port: 1234,
                host_port: 1234,
                protocol: "tcp".into(),
                description: "LM Studio API".into(),
            }],
            env_vars: vec![],
            volumes: vec![],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:1234/v1/models".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 5,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 4096, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: false,
            web_ui_path: None,
            documentation_url: "https://lmstudio.ai/docs".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "jan".into(),
            name: "Jan.ai".into(),
            description: "Open-source ChatGPT alternative that runs 100% offline on your computer.".into(),
            version: "latest".into(),
            category: ToolCategory::LlmEngine,
            deployment: DeploymentMethod::NativeBinary,
            docker_image: None,
            compose_template: None,
            native_install_url: Some("https://jan.ai".into()),
            ports: vec![ExposedPort {
                container_port: 1337,
                host_port: 1337,
                protocol: "tcp".into(),
                description: "Jan API Server".into(),
            }],
            env_vars: vec![],
            volumes: vec![],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:1337/v1/models".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 5,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 4096, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://jan.ai/docs".into(),
            logo_url: None,
        },

        // ── Category 2: AI Chat, RAG & Knowledge Workspaces ──
        ServiceRecipe {
            id: "open-webui".into(),
            name: "Open WebUI".into(),
            description: "Feature-rich, self-hosted AI chat interface. Pre-configured to auto-link with your Ollama instance.".into(),
            version: "latest".into(),
            category: ToolCategory::AiChat,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("ghcr.io/open-webui/open-webui:main".into()),
            compose_template: Some(r#"services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: ghostcompute-open-webui
    ports:
      - "3000:8080"
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - WEBUI_AUTH=false
    volumes:
      - ./data/open-webui:/app/backend/data
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort {
                container_port: 8080,
                host_port: 3000,
                protocol: "tcp".into(),
                description: "Open WebUI Dashboard".into(),
            }],
            env_vars: vec![
                EnvVar { key: "OLLAMA_BASE_URL".into(), default_value: "http://host.docker.internal:11434".into(), description: "Ollama API endpoint".into(), secret: false },
            ],
            volumes: vec![VolumeMount {
                host_path: "open-webui/data".into(),
                container_path: "/app/backend/data".into(),
                description: "Persistent data".into(),
            }],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:3000".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 10,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec!["ollama".into()],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.openwebui.com".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "anythingllm".into(),
            name: "AnythingLLM".into(),
            description: "All-in-one AI application for RAG, agents, and document Q&A with multi-user support.".into(),
            version: "latest".into(),
            category: ToolCategory::AiChat,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("mintplexlabs/anythingllm:latest".into()),
            compose_template: Some(r#"services:
  anythingllm:
    image: mintplexlabs/anythingllm:latest
    container_name: ghostcompute-anythingllm
    ports:
      - "3001:3001"
    environment:
      - STORAGE_DIR=/app/server/storage
      - LLM_PROVIDER=ollama
      - OLLAMA_BASE_PATH=http://host.docker.internal:11434
    volumes:
      - ./data/anythingllm:/app/server/storage
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort {
                container_port: 3001,
                host_port: 3001,
                protocol: "tcp".into(),
                description: "AnythingLLM Dashboard".into(),
            }],
            env_vars: vec![],
            volumes: vec![VolumeMount {
                host_path: "anythingllm/storage".into(),
                container_path: "/app/server/storage".into(),
                description: "Document and embedding storage".into(),
            }],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:3001/api/ping".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 10,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.anythingllm.com".into(),
            logo_url: None,
        },

        // ── Category 3: Image, Audio & Media Generation ──
        ServiceRecipe {
            id: "comfyui".into(),
            name: "ComfyUI".into(),
            description: "Powerful node-based UI for Stable Diffusion. Runs bare-metal natively for maximum GPU VRAM throughput and fast generation.".into(),
            version: "latest".into(),
            category: ToolCategory::MediaGeneration,
            deployment: DeploymentMethod::NativeBinary,
            docker_image: None,
            compose_template: Some(r#"services:
  comfyui:
    image: ghcr.io/ai-dock/comfyui:latest
    container_name: ghostcompute-comfyui
    ports:
      - "8188:8188"
    volumes:
      - ./data/comfyui/output:/opt/ComfyUI/output
      - ./data/comfyui/models:/opt/ComfyUI/models
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped"#.into()),
            native_install_url: Some("https://github.com/comfyanonymous/ComfyUI".into()),
            ports: vec![ExposedPort {
                container_port: 8188,
                host_port: 8188,
                protocol: "tcp".into(),
                description: "ComfyUI Web Interface".into(),
            }],
            env_vars: vec![],
            volumes: vec![
                VolumeMount { host_path: "comfyui/output".into(), container_path: "/opt/ComfyUI/output".into(), description: "Generated images".into() },
                VolumeMount { host_path: "comfyui/models".into(), container_path: "/opt/ComfyUI/models".into(), description: "Model checkpoints".into() },
            ],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:8188".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 10,
            }),
            gpu: GpuConfig { required: true, recommended_vram_mb: 8192, nvidia_runtime: true, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://github.com/comfyanonymous/ComfyUI".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "whisper".into(),
            name: "Whisper ASR".into(),
            description: "High-speed GPU-accelerated speech-to-text transcription using OpenAI Whisper.".into(),
            version: "latest".into(),
            category: ToolCategory::MediaGeneration,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("onerahmet/openai-whisper-asr-webservice:latest-gpu".into()),
            compose_template: Some(r#"services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest-gpu
    container_name: ghostcompute-whisper
    ports:
      - "9000:9000"
    environment:
      - ASR_MODEL=base
      - ASR_ENGINE=openai_whisper
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort {
                container_port: 9000,
                host_port: 9000,
                protocol: "tcp".into(),
                description: "Whisper ASR API".into(),
            }],
            env_vars: vec![
                EnvVar { key: "ASR_MODEL".into(), default_value: "base".into(), description: "Whisper model size (tiny/base/small/medium/large)".into(), secret: false },
            ],
            volumes: vec![],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:9000/".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 30,
                timeout_secs: 10,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 2048, nvidia_runtime: true, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://github.com/ahmetoner/whisper-asr-webservice".into(),
            logo_url: None,
        },

        // ── Category 4: Workflow Automation & AI Agents ──
        ServiceRecipe {
            id: "n8n".into(),
            name: "n8n".into(),
            description: "Powerful workflow automation platform with 400+ integrations, pre-linked to local LLMs.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("n8nio/n8n:latest".into()),
            compose_template: Some(r#"services:
  n8n:
    image: n8nio/n8n:latest
    container_name: ghostcompute-n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - ./data/n8n:/home/node/.n8n
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 5678, host_port: 5678, protocol: "tcp".into(), description: "n8n Dashboard".into() }],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "n8n/data".into(), container_path: "/home/node/.n8n".into(), description: "Workflow data".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:5678/healthz".into(), method: "GET".into(), expected_status: 200, interval_secs: 15, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.n8n.io".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "dify".into(),
            name: "Dify".into(),
            description: "LLM app development platform for building AI-native applications with agentic workflows.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerCompose,
            docker_image: None,
            compose_template: Some(r#"services:
  dify-api:
    image: langgenius/dify-api:latest
    container_name: ghostcompute-dify-api
    ports:
      - "5001:5001"
    environment:
      - MODE=api
      - SECRET_KEY=ghostcompute-dify-secret
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
  dify-web:
    image: langgenius/dify-web:latest
    container_name: ghostcompute-dify-web
    ports:
      - "3100:3000"
    environment:
      - CONSOLE_API_URL=http://localhost:5001
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![
                ExposedPort { container_port: 5001, host_port: 5001, protocol: "tcp".into(), description: "Dify API".into() },
                ExposedPort { container_port: 3000, host_port: 3100, protocol: "tcp".into(), description: "Dify Web UI".into() },
            ],
            env_vars: vec![],
            volumes: vec![],
            health_check: Some(HealthCheck { endpoint: "http://localhost:5001/health".into(), method: "GET".into(), expected_status: 200, interval_secs: 20, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.dify.ai".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "activepieces".into(),
            name: "Activepieces".into(),
            description: "Open-source no-code business automation platform with AI-ready pieces.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("activepieces/activepieces:latest".into()),
            compose_template: Some(r#"services:
  activepieces:
    image: activepieces/activepieces:latest
    container_name: ghostcompute-activepieces
    ports:
      - "8080:80"
    environment:
      - AP_ENGINE_EXECUTABLE_PATH=dist/packages/engine/main.js
      - AP_ENVIRONMENT=prod
      - AP_FRONTEND_URL=http://localhost:8080
      - AP_WEBHOOK_TIMEOUT_SECONDS=30
      - AP_TRIGGER_DEFAULT_POLL_INTERVAL=5
    volumes:
      - ./data/activepieces:/root/.activepieces
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 80, host_port: 8080, protocol: "tcp".into(), description: "Activepieces Dashboard".into() }],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "activepieces/data".into(), container_path: "/root/.activepieces".into(), description: "Persistent data".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:8080".into(), method: "GET".into(), expected_status: 200, interval_secs: 15, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://www.activepieces.com/docs".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "flowise".into(),
            name: "Flowise".into(),
            description: "Drag-and-drop UI for building LLM orchestration flows and chatbots.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("flowiseai/flowise:latest".into()),
            compose_template: Some(r#"services:
  flowise:
    image: flowiseai/flowise:latest
    container_name: ghostcompute-flowise
    ports:
      - "3002:3000"
    volumes:
      - ./data/flowise:/root/.flowise
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    command: flowise start"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 3000, host_port: 3002, protocol: "tcp".into(), description: "Flowise Dashboard".into() }],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "flowise/data".into(), container_path: "/root/.flowise".into(), description: "Flow data".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:3002".into(), method: "GET".into(), expected_status: 200, interval_secs: 15, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.flowiseai.com".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "langflow".into(),
            name: "Langflow".into(),
            description: "Visual framework for building multi-agent and RAG applications with a Python backend.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("langflowai/langflow:latest".into()),
            compose_template: Some(r#"services:
  langflow:
    image: langflowai/langflow:latest
    container_name: ghostcompute-langflow
    ports:
      - "7860:7860"
    volumes:
      - ./data/langflow:/app/langflow
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 7860, host_port: 7860, protocol: "tcp".into(), description: "Langflow Dashboard".into() }],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "langflow/data".into(), container_path: "/app/langflow".into(), description: "Flow data".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:7860/health".into(), method: "GET".into(), expected_status: 200, interval_secs: 20, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://docs.langflow.org".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "open-interpreter".into(),
            name: "Open Interpreter".into(),
            description: "Sandboxed code execution and natural-language computer agent interface.".into(),
            version: "latest".into(),
            category: ToolCategory::WorkflowAutomation,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("ghcr.io/openinterpreter/open-interpreter:latest".into()),
            compose_template: Some(r#"services:
  open-interpreter:
    image: ghcr.io/openinterpreter/open-interpreter:latest
    container_name: ghostcompute-open-interpreter
    ports:
      - "8000:8000"
    environment:
      - INTERPRETER_SAFE_MODE=true
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 8000, host_port: 8000, protocol: "tcp".into(), description: "Open Interpreter API".into() }],
            env_vars: vec![],
            volumes: vec![],
            health_check: Some(HealthCheck { endpoint: "http://localhost:8000".into(), method: "GET".into(), expected_status: 200, interval_secs: 20, timeout_secs: 10 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: false,
            web_ui_path: None,
            documentation_url: "https://docs.openinterpreter.com".into(),
            logo_url: None,
        },

        // ── Category 5: Coding Assistants & Vector Databases ──
        ServiceRecipe {
            id: "tabby".into(),
            name: "Tabby".into(),
            description: "Self-hosted AI coding assistant server with VS Code and JetBrains extensions.".into(),
            version: "latest".into(),
            category: ToolCategory::CodingAssistant,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("tabbyml/tabby:latest".into()),
            compose_template: Some(r#"services:
  tabby:
    image: tabbyml/tabby:latest
    container_name: ghostcompute-tabby
    ports:
      - "8082:8080"
    volumes:
      - ./data/tabby:/data
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    command: serve --model TabbyML/StarCoder-1B --device cuda
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![ExposedPort { container_port: 8080, host_port: 8082, protocol: "tcp".into(), description: "Tabby API & Dashboard".into() }],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "tabby/data".into(), container_path: "/data".into(), description: "Model and index data".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:8082/v1/health".into(), method: "GET".into(), expected_status: 200, interval_secs: 15, timeout_secs: 10 }),
            gpu: GpuConfig { required: true, recommended_vram_mb: 4096, nvidia_runtime: true, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/".into()),
            documentation_url: "https://tabby.tabbyml.com".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "twinny".into(),
            name: "Twinny Backend".into(),
            description: "Pre-configured backend for the Twinny VS Code extension, providing local code completion.".into(),
            version: "latest".into(),
            category: ToolCategory::CodingAssistant,
            deployment: DeploymentMethod::NativeBinary,
            docker_image: None,
            compose_template: None,
            native_install_url: Some("https://ollama.com/install.sh".into()),
            ports: vec![ExposedPort {
                container_port: 11434,
                host_port: 11434,
                protocol: "tcp".into(),
                description: "Ollama API (Twinny uses Ollama)".into(),
            }],
            env_vars: vec![],
            volumes: vec![],
            health_check: Some(HealthCheck {
                endpoint: "http://localhost:11434/api/version".into(),
                method: "GET".into(),
                expected_status: 200,
                interval_secs: 15,
                timeout_secs: 5,
            }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 2048, nvidia_runtime: false, rocm_support: false },
            depends_on: vec!["ollama".into()],
            web_ui: false,
            web_ui_path: None,
            documentation_url: "https://twinny.dev".into(),
            logo_url: None,
        },
        ServiceRecipe {
            id: "qdrant".into(),
            name: "Qdrant".into(),
            description: "High-performance vector database with web dashboard for RAG memory management.".into(),
            version: "latest".into(),
            category: ToolCategory::CodingAssistant,
            deployment: DeploymentMethod::DockerRun,
            docker_image: Some("qdrant/qdrant:latest".into()),
            compose_template: Some(r#"services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: ghostcompute-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./data/qdrant:/qdrant/storage
    restart: unless-stopped"#.into()),
            native_install_url: None,
            ports: vec![
                ExposedPort { container_port: 6333, host_port: 6333, protocol: "tcp".into(), description: "Qdrant REST API & Dashboard".into() },
                ExposedPort { container_port: 6334, host_port: 6334, protocol: "tcp".into(), description: "Qdrant gRPC".into() },
            ],
            env_vars: vec![],
            volumes: vec![VolumeMount { host_path: "qdrant/storage".into(), container_path: "/qdrant/storage".into(), description: "Vector storage".into() }],
            health_check: Some(HealthCheck { endpoint: "http://localhost:6333/healthz".into(), method: "GET".into(), expected_status: 200, interval_secs: 15, timeout_secs: 5 }),
            gpu: GpuConfig { required: false, recommended_vram_mb: 0, nvidia_runtime: false, rocm_support: false },
            depends_on: vec![],
            web_ui: true,
            web_ui_path: Some("/dashboard".into()),
            documentation_url: "https://qdrant.tech/documentation".into(),
            logo_url: None,
        },
    ]
}
