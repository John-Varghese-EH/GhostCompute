# API Reference (OpenAI Compatibility)

GhostCompute is designed to act as a seamless drop-in replacement for any tool expecting an OpenAI-compatible endpoint.

## Endpoint Base URL

When pointing your tools (Cursor, Claude Code, Cline, etc.) to GhostCompute, use the following base URL:

```
http://127.0.0.1:11434/v1
```

## Supported Endpoints

### 1. `GET /v1/models`
Retrieves the list of available models. 
- **Behavior**: Aggregates models from your Host's local Ollama instance over the P2P tunnel, and optionally appends cloud models (Gemini, Groq) if you have provided API keys in your settings.
- **Disconnected Behavior**: If the Host is offline, GhostCompute will still successfully return your configured Cloud models.

### 2. `POST /v1/chat/completions`
The standard chat completions endpoint. 
- **Behavior**: If the requested model is a Host-based Ollama model, the proxy securely tunnels the request to the Host. If the model is a Cloud model (`gemini-*` or `groq:*`), the request is seamlessly intercepted by the AI Gateway on the Client and routed directly to Google/Groq over the public internet.
- **Streaming**: Full support for Server-Sent Events (SSE) streaming (`"stream": true`), which is handled beautifully over WebRTC data channels for local models and over standard HTTPS for Cloud models.

### Model Prefixing
- **Ollama**: Use native model names (e.g., `llama3.1`, `qwen2.5-coder`).
- **Gemini**: Use native model names (e.g., `gemini-1.5-pro`, `gemini-1.5-flash`).
- **Groq**: Prefix Groq models with `groq:` (e.g., `groq:llama3-70b-8192`, `groq:mixtral-8x7b-32768`). GhostCompute automatically strips the prefix before sending the payload to Groq.
