# Security & Encryption

GhostCompute is designed with a zero-trust model. You should be able to route your P2P traffic through public infrastructure (like a public internet relay or Cloudflare) without ever exposing your prompts, AI outputs, or machine data to the intermediary.

## The Noise Protocol Framework

All data transmitted over the GhostCompute WebSocket connection is **End-to-End Encrypted (E2EE)** using the [Noise Protocol Framework](https://noiseprotocol.org/). 

### How it Works
- Every GhostCompute installation generates a local static `x25519` keypair (the "Identity Key").
- When a Client and Host connect, they perform a **Noise_XX** handshake.
- This handshake establishes perfect forward secrecy, mutual authentication, and generates symmetrical session keys used to encrypt the payload frames.
- A man-in-the-middle (MITM) observing the WebSocket traffic only sees encrypted noise; they cannot view the HTTP paths, headers, or body data.

## Pairing & Trust

To prevent MITM attacks during the initial connection phase, GhostCompute employs **Short Authentication Strings (SAS)**.

1. When pairing via a link, the Client initiates the connection.
2. Both machines derive a visual SAS string (e.g., `ALPHA-BRAVO-CHARLIE`) from the cryptographic handshake parameters.
3. The user must manually verify that the SAS matches on both the Host and Client screens before clicking "Approve".
4. Once approved, the machines trust each other's Identity Keys. Future connections between these keys are authenticated automatically without user intervention.

## Cloudflared Tunnel Integration

GhostCompute provides an option to spin up an ephemeral Cloudflare Tunnel (via `cloudflared`). 
- This is purely for **transport** across restrictive NATs/Firewalls.
- Cloudflare terminates the TLS layer, but the data inside the WebSocket is still encrypted via the Noise Protocol. 
- Cloudflare **cannot** read your AI prompts or model responses.
