# Using GhostCompute with Open WebUI

[Open WebUI](https://docs.openwebui.com/) is a powerful, self-hosted frontend for Large Language Models. If you want to run Open WebUI on your laptop but use the heavy models hosted on your desktop GPU, GhostCompute makes this simple and secure.

## Prerequisites
1. **GhostCompute** paired and running between your Client (laptop) and Host (desktop).
2. **Ollama** running on your Host.
3. **Open WebUI** installed on your Client (often via Docker).

## Setup Instructions

### If running Open WebUI natively or via Node:
Simply set the `OLLAMA_BASE_URL` to point to the GhostCompute local proxy port (default `11434`).

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434 npm run start
```

### If running Open WebUI via Docker:
When running in Docker, `127.0.0.1` refers to the container's internal localhost, not your host machine. You must use `host.docker.internal` (on Mac/Windows) or point it to your machine's local IP address.

```bash
docker run -d -p 3000:8080 \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

## Why GhostCompute?
Unlike opening Ollama to `0.0.0.0` and port-forwarding your router (which exposes your unauthenticated Ollama instance to the internet), GhostCompute secures the tunnel. You get the convenience of a local Open WebUI installation with the power of a remote GPU, entirely protected by E2E Noise encryption.
