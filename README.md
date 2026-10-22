<div align="center">
  <img src="public/logo.svg" alt="GhostCompute Logo" width="160" height="160" />
  
  # GhostCompute
  
  **Turn any High-End PC into a Private, Zero-Trust AI & Automation Cloud Server**

  [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
  [![Built with Tauri v2](https://img.shields.io/badge/Built_with-Tauri_v2-24c8db.svg)](https://tauri.app/)
  [![Frontend React 19](https://img.shields.io/badge/Frontend-React_19_+_Tailwind_v4-61dafb.svg)](https://react.dev/)
  [![Backend Rust](https://img.shields.io/badge/Backend-Rust_Async-dea584.svg)](https://www.rust-lang.org/)
  [![Security Noise Protocol](https://img.shields.io/badge/Tunnel-Cloudflare_+_Noise_XX-f38020.svg)](https://www.cloudflare.com/)

  *Enterprise-Grade Open-Source Desktop and Daemon Architecture*
</div>

---

## Executive Summary

GhostCompute transforms any high-end gaming PC or GPU workstation into a secure, self-hosted AI compute server accessible from any lightweight laptop (MacBook, thin client, or travel machine) across local networks (LAN) or over the internet (WAN).

The platform operates as a single unified binary supporting two distinct runtime modes:

- **Server Mode (Host):** Manages bare-metal GPU acceleration (NVIDIA CUDA, AMD ROCm, Apple Metal), runs an automated service catalog orchestrating 16 open-source AI applications, enforces multi-user role-based access control (RBAC), and provides zero-trust remote tunneling via Cloudflare or Pinggy.
- **Client Mode (Consumer):** Runs a silent background proxy daemon on `127.0.0.1:11434`, automatically configures developer tools (Claude Code, Cursor, Antigravity, Continue), and provides live connection-aware shortcuts to remote host services.

---

## Architecture: Hybrid Runtime Model

To maximize inference performance while maintaining clean system management, GhostCompute separates workloads into two execution layers:

```mermaid
flowchart LR
    subgraph ClientLaptop["Client Device (Lightweight Laptop)"]
        direction TB
        Agent["Coding Agents\n(Claude Code / Cursor / Antigravity)"]
        Browser["Web App Shortcuts\n(ComfyUI / Open WebUI / n8n)"]
        ClientProxy["GhostCompute Client Proxy\n(127.0.0.1:11434 /v1)"]
        Agent -->|HTTP / OpenAI API| ClientProxy
    end

    subgraph Tunnel["Zero-Trust Encrypted Tunnel"]
        CFTunnel["Cloudflare Tunnel / Pinggy\n(Noise Protocol XX E2EE)"]
    end

    subgraph HostPC["Server Host (Gaming PC / Workstation)"]
        direction TB
        HostDaemon["GhostCompute Host Daemon\n(Reverse Proxy and Admission Gate)"]
        RBAC["RBAC and API Token Store\n(Admin / Developer / Viewer)"]
        
        subgraph NativeEngines["Native Bare-Metal Tier (No Container Overhead)"]
            Ollama["Ollama Engine (Port 11434)"]
            LMStudio["LM Studio (Port 1234)"]
            Jan["Jan.ai (Port 1337)"]
        end

        subgraph DockerComposeApps["Containerized Application Tier (Docker Compose)"]
            OpenWebUI["Open WebUI (Port 3000)"]
            Comfy["ComfyUI (Port 8188)"]
            N8N["n8n Automation (Port 5678)"]
            Dify["Dify App Platform (Port 3100)"]
            Qdrant["Qdrant Vector DB (Port 6333)"]
        end

        HostDaemon --> RBAC
        HostDaemon --> NativeEngines
        HostDaemon --> DockerComposeApps
    end

    ClientProxy <==>|Encrypted WebSocket / mTLS| CFTunnel
    Browser -->|Direct Web UI| CFTunnel
    CFTunnel <==> HostDaemon
```

### 1. Bare-Metal Native Tier (Zero Docker Overhead)
Inference engines (Ollama, LM Studio, Jan.ai) run natively on the host operating system. This guarantees maximum memory bandwidth, direct CUDA/ROCm hardware utilization, and zero container virtualization latency.

### 2. Containerized Application Tier (Docker Compose)
Complex multi-service web platforms (Open WebUI, ComfyUI, AnythingLLM, n8n, Dify, Activepieces, Flowise, Langflow, Open Interpreter, Tabby, Qdrant) are managed via declarative Docker Compose recipes with isolated data volumes and managed port bindings.

---

## One-Click Application Catalog (16 Tools)

GhostCompute includes automated deployment definitions for 16 premier open-source AI tools:

| Category | Supported Services | Deployment Mode | Primary Capability | Default Port |
|:---|:---|:---|:---|:---|
| **Local LLM Engines** | Ollama, LM Studio, Jan.ai | Native Binary | GGUF model execution, bare-metal GPU passthrough, OpenAI `/v1` compatibility | `11434`, `1234`, `1337` |
| **AI Chat & Knowledge** | Open WebUI, AnythingLLM | Docker Container | Multi-user chat workspaces, retrieval-augmented generation (RAG), document ingestion | `3000`, `3001` |
| **Media Generation** | ComfyUI, Whisper ASR | Docker / Native | Node-based Stable Diffusion workflows, GPU speech-to-text transcription | `8188`, `9000` |
| **Workflow Automation** | n8n, Dify, Activepieces | Docker Compose | Low-code workflow automation, agent orchestration, 400+ API integrations | `5678`, `3100`, `8080` |
| **Visual Agent Builders** | Flowise, Langflow, Open Interpreter | Docker Compose | Drag-and-drop LLM pipelines, autonomous computer execution | `3002`, `7860`, `8000` |
| **Coding & Vector Stores** | Tabby, Twinny Backend, Qdrant | Docker / Native | Self-hosted code completion for IDEs, high-performance vector search engine | `8082`, `11434`, `6333` |

---

## Security Model and Multi-Tenancy

GhostCompute incorporates defense-in-depth security principles across all transport and application layers:

- **End-to-End Encryption (Noise Protocol XX):** All peer sessions establish authenticated, end-to-end encrypted tunnels using the Noise XX pattern with Curve25519, ChaCha20-Poly1305, and BLAKE2s. Intermediate tunnel relays (such as Cloudflare or Pinggy) terminate only the outer transport TLS and cannot inspect inner application payloads.
- **Short Authentication String (SAS) Verification:** During initial peer pairing, both devices generate an identical 6-character cryptographic verification string derived from the ephemeral session keys, preventing Man-in-the-Middle (MITM) attacks.
- **Role-Based Access Control (RBAC):** Hosts assign granular permission tiers to connected clients:
  - **Admin:** Full administrative control, service management, model pulling, and client pairing.
  - **Developer:** Unlimited access to AI inference endpoints and development proxies.
  - **Viewer:** Read-only access with restricted request quotas.
- **Cryptographic API Tokens:** Hosts issue revocable `gc_live_*` bearer tokens with configurable requests-per-minute (RPM) rate limiting.
- **VRAM and Compute Guard:** Real-time hardware telemetry monitors GPU temperature, VRAM allocation, and system memory, automatically throttling oversized context requests.

---

## Getting Started

### Prerequisites

- **Host Device:** Windows 10/11 (64-bit) or Linux (x86_64) with dedicated GPU (NVIDIA CUDA recommended).
- **Client Device:** macOS, Linux, or Windows (any lightweight hardware).
- **Development Toolchain:** Node.js 18+ and Rust (stable) installed.

### Build and Launch

```bash
# Clone the repository
git clone https://github.com/John-Varghese-EH/GhostCompute.git
cd GhostCompute

# Install frontend dependencies
npm install

# Run application in development mode
npm run tauri dev

# Compile release package
npm run tauri build
```

---

## Step-by-Step Connection Guide

### Setting up the Host (Server)
1. Launch GhostCompute and select **Server Mode (Host)**.
2. In Step 2 (**LAN Broadcast & Client Pairing**), the application starts hosting on port `8384` and advertises availability across your local network via mDNS (`_ghostcompute._tcp.local.`).
3. Note your displayed local IP address (e.g. `http://192.168.1.150:8384`) or click **Generate PIN** to create a temporary 6-digit code.

### Connecting from a Client (Laptop)
1. Launch GhostCompute on your laptop and select **Client Mode (Consumer)**.
2. Under **Nearby Discovery**, your Host machine will appear automatically. Click **Connect**.
   *(If on a separated subnet or remote network, switch to the Direct IP tab and enter the Host IP address or Cloudflare Tunnel URL).*
3. Verify that the 6-character verification string matches the Host display, and click **Confirm Match**.
4. Both devices are now paired. Your client proxy daemon runs on `http://127.0.0.1:11434`.

---

## Coding Agent Integration

GhostCompute routes developer requests directly to your remote GPU rig without changing local workflows.

### Claude Code CLI
```bash
export OLLAMA_HOST=http://127.0.0.1:11434
claude --provider ollama --model <model-name>
```

### Cursor & Antigravity IDE
Configure local model settings as follows:
- **Base URL:** `http://127.0.0.1:11434/v1`
- **API Key:** `gc_live_authenticated` (or any string)
- **Model Name:** Enter any model installed on your remote host (e.g. `qwen2.5-coder:7b`, `llama3.3:70b`, `deepseek-r1:14b`)

### Continue.dev (VS Code & JetBrains)
```json
{
  "models": [
    {
      "title": "GhostCompute Remote",
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "apiBase": "http://127.0.0.1:11434"
    }
  ]
}
```

---

## Port Allocation Reference

| Port | Service | Protocol | Access Scope |
|:---|:---|:---|:---|
| `8384` | GhostCompute Host Daemon | TCP / WebSocket | LAN / Cloudflare Tunnel |
| `11434` | Ollama Engine (Host) & Local Proxy (Client) | HTTP / REST | Host Internal & Client Localhost |
| `1234` | LM Studio Inference Server | HTTP / REST | Host Localhost |
| `3000` | Open WebUI Dashboard | HTTP | Host / Tunnel |
| `5678` | n8n Automation Engine | HTTP | Host / Tunnel |
| `6333` | Qdrant Vector Database | HTTP / REST | Host / Docker Internal |
| `8188` | ComfyUI Workspace | HTTP / WebSocket | Host / Tunnel |

---

## Author Credits

**John Varghese (J0X)**  
*Principal Systems Architect & Lead Engineer*

- **GitHub:** [https://github.com/John-Varghese-EH](https://github.com/John-Varghese-EH)
- **LinkedIn:** [https://linkedin.com/in/John--Varghese](https://linkedin.com/in/John--Varghese)

---

<div align="center">
  <sub>© 2026 John Varghese (J0X) • GhostCompute • Licensed under GPLv3</sub>
</div>
