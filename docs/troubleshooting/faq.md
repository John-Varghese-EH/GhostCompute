# Frequently Asked Questions (FAQ)

### What is GhostCompute?
GhostCompute is a secure P2P proxy designed to let you use remote AI models (like an Ollama instance running on a desktop GPU) as if they were running locally on your current machine.

### Does GhostCompute support other backends besides Ollama?
GhostCompute operates as a generic Layer 7 HTTP tunnel. While it is heavily optimized and tested for Ollama endpoints, you can theoretically map the Host proxy to ANY HTTP server backend (e.g., vLLM, text-generation-webui) running on the host machine. 

### Does Cloudflare see my AI data?
No. If you use the Cloudflare Relay option to traverse strict firewalls, Cloudflare only sees the encrypted Noise protocol WebSocket frames. The encryption keys are generated and exchanged securely between your Client and Host. Cloudflare cannot decrypt the HTTP requests or the AI model's responses.

### Can I share my Host with multiple Clients?
Yes! The Host can pair with multiple Client machines. However, the Host's GPU resources will be shared across all incoming requests, which may slow down inference times if multiple clients request generation simultaneously.

### Why not just use Tailscale or Wireguard?
VPNs like Tailscale are fantastic, but they expose your entire machine (or specific ports) at a network layer, requiring you to configure IP addresses and port bindings in your client tools. GhostCompute is purpose-built for AI API proxying: it requires zero network configuration, automatically binds to `localhost` on the client, and seamlessly handles HTTP multiplexing specifically for API payloads. 

### Is GhostCompute open source?
Yes, GhostCompute is entirely open-source and built using Rust and Tauri.
