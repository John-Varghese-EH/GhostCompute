# Troubleshooting

This document outlines common issues and their solutions when using GhostCompute.

## 1. Connection Errors (Client to Host)

**Symptom**: Client shows "Disconnected" or fails to connect to the Host.
**Fixes**:
- Ensure the **Room ID** matches exactly on both the Host and Client laptops.
- Make sure the Host has clicked "Start Server" and shows "Ready/Listening".
- Check that the Host's firewall isn't blocking outgoing WebRTC connections.

## 2. API Proxy Errors (IDE to Client)

**Symptom**: IDEs like Cursor show "Connection Refused" when making queries.
**Fixes**:
- Verify the **API Proxy** is enabled in the Client Settings.
- Ensure the API Proxy port (default `11434`) is not currently in use by another local application (like a local installation of Ollama on your Client laptop). If so, change the API Proxy Port in GhostCompute and update your IDE to match.

## 3. "Model Not Found"

**Symptom**: Querying a model fails with a 404 or Model Not Found error.
**Fixes**:
- The model must exist on your Host's local Ollama instance. Run `ollama pull <model_name>` on your Host laptop.
- Check the output of `http://127.0.0.1:11434/v1/models` in your browser to verify what models are currently visible to the Client.

## 4. Cloud Models Failing

**Symptom**: Groq or Gemini models are not responding, but local models work.
**Fixes**:
- Check the **Cloud Fallback API Keys** section in your Client settings. Ensure the API keys are correct.
- Remember to prefix Groq models with `groq:` in your IDE (e.g., `groq:llama3-8b-8192`). 
- Check your network connection. Cloud requests bypass the Host and go directly to the internet.
