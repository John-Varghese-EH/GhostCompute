# GhostCompute Documentation

Welcome to the official documentation for **GhostCompute**! 

GhostCompute is a powerful, secure, and transparent peer-to-peer (P2P) Layer 7 HTTP tunnel designed to expose local AI models (like Ollama) to remote machines as if they were running locally. Whether you want to leverage a powerful GPU rig from your thin client laptop or share your local AI capabilities securely with a colleague, GhostCompute handles the heavy lifting seamlessly.

## Table of Contents

### Getting Started
- [Installation Guide](getting-started/installation.md)
- [Quickstart & Pairing](getting-started/quickstart.md)

### Architecture
- [System Overview](architecture/overview.md)
- [Security & Encryption (Noise Protocol)](architecture/security.md)

### Use Cases & Integrations
- [Using with Claude Code](use-cases/claude-code.md)
- [Connecting Open WebUI](use-cases/open-webui.md)
- [Programmatic API Access & cURL](use-cases/api-access.md)

### Support
- [Common Issues](troubleshooting/common-issues.md)
- [FAQ](troubleshooting/faq.md)

---

> **Why GhostCompute?**
> Rather than relying on generic VPNs or clunky reverse proxies that break streaming protocols, GhostCompute is built specifically for AI model access. It features real-time bidirectional chunk streaming over WebSockets, end-to-end encryption using the Noise protocol, and a beautiful native Tauri interface.
