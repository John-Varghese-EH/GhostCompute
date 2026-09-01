# System Overview

GhostCompute leverages a novel architecture to expose local AI APIs to remote machines securely and seamlessly without relying on traditional VPN software or rigid port forwarding.

## Core Concepts

### 1. Peer-to-Peer (P2P) Communication
Instead of a centralized server relay, GhostCompute establishes a direct WebSocket connection between your Client and Host machine. If you are traversing NATs or firewalls, GhostCompute utilizes a Cloudflare Tunnel as a transparent WebSocket relay.

### 2. The Layer 7 HTTP Tunnel

GhostCompute operates as a **Layer 7 HTTP Multiplexer**. 

#### Why not a standard Reverse Proxy?
Standard HTTP reverse proxies (like Nginx) can struggle with P2P NAT traversal. Port forwarding exposes your machine to the public web. 

#### How GhostCompute Works:
1. **Axum Local Server (Client)**: The client machine runs a local `axum` webserver listening on `127.0.0.1:<PORT>`.
2. **Request Encapsulation**: When a tool sends an HTTP request to this local server, GhostCompute captures the *entire* request (Method, Path, Headers, Body) and packages it into a JSON payload called an `HttpProxyRequest`.
3. **Multiplexing**: The `HttpProxyRequest` is assigned a unique `req_id` and sent over the active P2P WebSocket connection to the Host.
4. **Host Execution**: The Host receives the payload, reconstructs it using `reqwest`, and fires it against the local `http://127.0.0.1:11434` (Ollama backend).
5. **Streaming Response**: As the local Ollama backend streams chunks (e.g., token generation), the Host encapsulates these chunks into `HttpProxyResponseChunk` payloads and sends them back over the WebSocket.
6. **Reassembly**: The Client uses the `req_id` to route the chunks to the correct waiting HTTP connection, streams them to the application, and completes the request seamlessly.

### Benefits of this Architecture
- **Tool Agnostic**: Because GhostCompute acts as a true L7 proxy, it doesn't care if the request is an OpenAI format, an Ollama custom endpoint, or a health check. Everything works.
- **Concurrent**: Multiplexing via `req_id` allows multiple tools to query the Host simultaneously over a single WebSocket connection.
- **Secure**: All WebSocket frames are end-to-end encrypted using the Noise protocol before being transmitted.
