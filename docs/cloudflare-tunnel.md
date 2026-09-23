# Cloudflare Tunnel Configuration

GhostCompute relies on **Cloudflare Tunnels** to expose your Host machine's secure GhostCompute listener to the internet safely, without opening any router ports or messing with dynamic DNS.

Follow these steps to set up a Cloudflare Tunnel for your GhostCompute Host.

## Prerequisites
- A Cloudflare account (free)
- A domain name managed by Cloudflare

## Step 1: Create a Tunnel

1. Log in to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Networks > Tunnels**.
3. Click **Create a tunnel**.
4. Choose **Cloudflared** and click Next.
5. Name your tunnel something memorable, like `ghostcompute-host` and click **Save tunnel**.

## Step 2: Route Traffic to GhostCompute

1. Skip the installation instructions (GhostCompute handles this for you) and click **Next**.
2. Under the **Public Hostname** tab, configure a subdomain for your GhostCompute endpoint (e.g., `ai.yourdomain.com`).
3. Under **Service**:
   - Set Type to `HTTP`.
   - Set URL to `localhost:11435` (This is GhostCompute's default P2P listener port, not Ollama's port).
4. Click **Save hostname**.

## Step 3: Get Your Tunnel Token

1. Back on the Tunnels page, click on your newly created tunnel to open its settings.
2. In the **Install and run a connector** section, look at the command provided (e.g., the Docker or Linux command).
3. Find the string of characters after `--token`. This long string is your **Cloudflare Token**.
4. Copy this token.

## Step 4: Configure GhostCompute

1. Open GhostCompute on your Host machine.
2. Go to the **Settings** tab.
3. Paste your copied token into the **Cloudflare Tunnel Token** field.
4. Go to the **Hosting** tab.
5. In the **Cloudflare Tunnel URL** field, enter the public hostname you configured in Step 2 (e.g., `https://ai.yourdomain.com`).
6. Click **Start Hosting**.

GhostCompute will now securely route P2P traffic through Cloudflare!
