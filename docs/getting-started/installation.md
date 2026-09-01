# Installation Guide

GhostCompute is built using [Tauri](https://tauri.app/) and Rust, ensuring a lightweight footprint and blazing-fast performance on any major operating system.

## Prerequisites

Before installing GhostCompute, ensure you have the following installed on your machine:
- **Rust Toolchain**: [Install Rust](https://www.rust-lang.org/tools/install)
- **Node.js**: (Version 18+ recommended) [Install Node](https://nodejs.org/en)
- **Ollama** (Host Machine Only): [Install Ollama](https://ollama.com/)

> **Note on OS Dependencies**: Linux users may need to install Tauri prerequisites like `webkit2gtk-4.0` and `build-essential`. See the [Tauri Linux Setup Guide](https://tauri.app/v1/guides/getting-started/prerequisites#linux).

## Building from Source

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/GhostCompute.git
   cd GhostCompute
   ```

2. **Install Frontend Dependencies**
   ```bash
   npm install
   ```

3. **Run in Development Mode**
   ```bash
   npm run tauri dev
   ```
   This will launch the application UI and start the local peer-to-peer server instances.

4. **Build for Production**
   ```bash
   npm run tauri build
   ```
   The compiled executable will be located in `src-tauri/target/release/`.

## Architecture Note
GhostCompute acts as both a **Host** (the machine running the GPU/Ollama instance) and a **Client** (the laptop or secondary machine making the request). The exact same binary is used for both!
