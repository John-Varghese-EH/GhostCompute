# Common Issues & Troubleshooting

If you are experiencing issues using GhostCompute, consult this guide for solutions to common problems.

## 1. Connection Refused / Cannot Connect to Local Proxy

**Symptom**: When trying to curl `http://127.0.0.1:11434` on the Client, you get `Connection refused`.
**Cause**: The GhostCompute local Axum server is not running or failed to bind to the port.
**Solution**: 
- Ensure GhostCompute is actively running on the Client machine.
- Verify the connection to the Host is fully paired and shows "Connected" in the UI.
- Check if another application (like a local installation of Ollama on the Client machine) is already bound to port `11434`. You can change GhostCompute's local port in the settings if necessary.

## 2. Pairing Link Times Out

**Symptom**: You paste the `ghost-compute://` link into the Client, but the pairing process times out or fails.
**Cause**: The network connection between the Client and Host is blocked, or the Host is behind a restrictive NAT.
**Solution**: 
- Ensure the Host machine has an active internet connection.
- Enable the **Cloudflare Relay** option on the Host machine before generating the link. This spins up an ephemeral Cloudflare tunnel (`trycloudflare.com`) to reliably bypass strict firewalls and NATs. (Note: The data inside the tunnel remains E2E encrypted via the Noise protocol).

## 3. "502 Bad Gateway" when sending requests

**Symptom**: You send a request to the Client proxy and receive a `502 Bad Gateway` response.
**Cause**: The Client successfully sent the request to the Host, but the Host failed to forward it to the local Ollama instance.
**Solution**:
- Ensure Ollama is actually running on the **Host** machine.
- Verify Ollama on the Host is listening on `127.0.0.1:11434`. If it's configured to run on a different port, update the Host settings in GhostCompute.

## 4. Responses are slow or choppy

**Symptom**: Streaming responses from the proxy pause for long periods or stutter.
**Cause**: High latency on the P2P connection, or the Host's GPU is overloaded.
**Solution**:
- This is rarely a GhostCompute issue. Check the GPU utilization on the Host machine. If the Host is running out of VRAM and swapping to system memory, generation speed will drastically slow down.
- If using the Cloudflare Relay, network latency can occasionally fluctuate. A direct P2P connection (if possible via LAN or public IP) is always faster.
