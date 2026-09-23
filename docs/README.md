# GhostCompute Documentation

Welcome to the **GhostCompute** documentation. GhostCompute allows you to transform a powerful gaming laptop into a centralized AI inference server (Host) and securely access it from any low-end laptop (Client) over the internet, feeling as if the models were running locally. 

This repository provides an enterprise-grade AI Gateway and P2P tunnel built with Rust and Tauri.

## Table of Contents

- [Setup & Configuration](setup.md)
  Learn how to install and configure GhostCompute on both the Host and Client laptops.
- [Architecture](architecture.md)
  Dive deep into how the Peer-to-Peer (P2P) tunnel and AI Gateway fallback logic work.
- [API Reference](api_reference.md)
  Details on the OpenAI-compatible API layer for seamless integration with Cursor, Claude Code, and other AI IDEs.
- [Troubleshooting](troubleshooting.md)
  Tips and fixes for common issues such as connection failures and API key errors.

## Key Features
- **Zero Configuration Networking**: Connect over NATs and firewalls seamlessly.
- **Cross-Platform**: Executables for Windows, macOS, and Linux built automatically via GitHub Actions.
- **Cloud Fallback**: Enter Gemini or Groq API keys on the Client, and the Gateway will route traffic to them gracefully when the Host is offline.
- **OpenAI Compatibility**: Works drop-in with any tool expecting `http://localhost:11434/v1`.

### Quick Start
To get started right away, please see the [Setup & Configuration](setup.md) guide.
