# Using GhostCompute with Claude Code

[Claude Code](https://github.com/anthropics/claude-code) is an exceptional AI assistant for software development. However, running local models with Claude Code often requires a powerful machine. With GhostCompute, you can run Claude Code on your thin client and offload the inference to your Host machine seamlessly.

## Prerequisites
1. **GhostCompute** running and paired between your Client and Host.
2. **Ollama** running on your Host machine with an appropriate model installed (e.g., `llama3.3`).

## Setup Instructions

1. On your Client machine, ensure GhostCompute is connected and the local proxy is running (default: `127.0.0.1:11434`).
2. Open your terminal on the Client machine.
3. Configure Claude Code to use your local Ollama proxy. Since GhostCompute accurately mimics the Ollama REST API, no special configuration is needed.

Set the environmental variables to point Claude to the proxy:
```bash
export OLLAMA_HOST=http://127.0.0.1:11434
```

Then launch Claude Code and instruct it to use Ollama:
```bash
claude --provider ollama --model llama3.3
```

## Why it Works
Claude Code expects to speak to an Ollama server. When it sends its `POST /api/chat` or `POST /api/generate` requests to `127.0.0.1:11434`, GhostCompute's Layer 7 HTTP Tunnel intercepts the request, streams it over the P2P websocket to the Host, and streams the inference chunks back in real-time. Claude Code remains entirely unaware that it is speaking to a proxy.
