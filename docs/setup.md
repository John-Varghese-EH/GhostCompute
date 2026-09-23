# Setup & Configuration

This guide will walk you through setting up GhostCompute on both the powerful gaming laptop (Host) and your lightweight laptop (Client).

## Prerequisites
- Ollama must be installed on the **Host** machine.
- Cloudflare configured for WebRTC (if applicable to your network).

## 1. Host Setup
The Host is the machine running the heavy LLM inferences.

1. Launch **GhostCompute**.
2. Go to the **Settings** tab.
3. Under the **Host Settings** section:
   - Ensure the server is listening on an open port.
   - Enter a secure **Room ID** (e.g., `my-secret-room-123`). Keep this safe!
4. Under the **Ollama Settings** section, ensure the URL points to your local Ollama instance (default: `http://127.0.0.1:11434`).
5. Go to the **Host** tab and click **Start Server**. 
6. Wait for the connection indicator to show **Ready/Listening**.

## 2. Client Setup
The Client is the machine you will use to connect to the Host and use the AI models.

1. Launch **GhostCompute** on your second laptop.
2. Go to the **Settings** tab.
3. Under the **Client Settings** section:
   - Enter the exact same **Room ID** you used on the Host.
4. Under the **API Proxy Settings** section:
   - Enable the API Proxy (Default: Port 11434).
   - This makes GhostCompute act like a local Ollama instance on your client machine!
5. (Optional) **Cloud Fallback Configuration**:
   - Scroll down to the **Cloud Fallback API Keys** section.
   - Enter your Gemini and/or Groq API keys.
   - If the Host disconnects or is turned off, the Gateway will seamlessly fallback to Gemini/Groq!
6. Go to the **Client** tab and click **Connect**.
7. Once connected, your local tools (Cursor, Claude Code, etc.) can hit `http://127.0.0.1:11434` and requests will securely tunnel to your Host!

## Using the Proxy
Point your favorite IDE or chat interface (like Continue.dev, Claude Code, or Cursor) to:
```
Base URL: http://127.0.0.1:11434/v1
```
The Client proxy handles the rest.
