# Quickstart & Pairing

This guide covers how to connect your **Client Machine** (e.g., your lightweight laptop) to your **Host Machine** (e.g., your powerful desktop GPU rig) using GhostCompute.

## Step 1: Start the Host Machine

1. Launch **GhostCompute** on your Host Machine.
2. Ensure **Ollama** is running locally on this machine (by default on port `11434`).
3. In GhostCompute, navigate to the **Host** tab or dashboard.
4. Click **Generate Pairing Link**. The app will generate a secure `ghost-compute://` link and a short code.

## Step 2: Connect the Client Machine

1. Launch **GhostCompute** on your Client Machine.
2. Navigate to the **Connect** tab.
3. Paste the `ghost-compute://` link or enter the short code provided by the Host Machine.
4. Click **Pair**.

## Step 3: Approve the Connection

1. On the **Host Machine**, a prompt will appear requesting permission to allow the client to connect.
2. Verify that the **SAS (Short Authentication String)** matches on both screens to prevent Man-in-the-Middle (MITM) attacks.
3. Click **Approve**.

## Step 4: Use Your Local Proxy!

Once connected, GhostCompute on your **Client Machine** will automatically bind to `http://127.0.0.1:<PORT>` (usually port `11434` or as configured in settings).

You can now point ANY local tool (Claude Code, Open WebUI, cURL) to your Client's `localhost` as if Ollama was running natively.

### Example test:
On your client machine:
```bash
curl http://127.0.0.1:11434/api/tags
```
If successful, you will see a list of the models hosted on your *remote* Host Machine!
