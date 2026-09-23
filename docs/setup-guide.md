# Setup Guide

This guide will walk you through setting up GhostCompute on both your Host (the machine running Ollama) and your Client (the machine that wants to use the AI).

## 1. Install Ollama on the Host

Before GhostCompute can share your AI compute, you need to have Ollama installed and running on your Host machine.

1. Download and install Ollama from [ollama.com](https://ollama.com/).
2. Run `ollama run llama3.1:8b` (or any other model) to ensure it works correctly and the model is downloaded.

## 2. Install GhostCompute

GhostCompute runs on Windows, macOS, and Linux.

1. Download the latest release from the [GitHub Releases](https://github.com/GhostCompute/releases) page.
2. Install it on **both** your Host machine and your Client machine.

## 3. Host Setup

1. Open GhostCompute on your powerful Host machine.
2. (Optional but Recommended) Go to **Settings** and configure your **Cloudflare Tunnel Token** and **Cloudflare Tunnel URL**. See the [Cloudflare Tunnel Guide](./cloudflare-tunnel.md) for details.
3. Click the **Hosting** tab.
4. Click **Start Hosting**. GhostCompute is now securely listening for P2P connections.
5. In the **Devices** tab, click **Generate Pairing Link**. Copy this link and send it to your Client machine.

## 4. Client Setup

1. Open GhostCompute on your Client machine.
2. Go to the **Connect** tab.
3. Paste the Pairing Link you received from the Host.
4. Click **Connect**.
5. Once paired, you can disconnect and reconnect anytime without needing a new pairing link, as long as the device hasn't been revoked.

## 5. Enjoy your API Proxy!

Once your Client is connected, GhostCompute automatically starts a local API proxy on the Client at `http://127.0.0.1:11434`. This proxy perfectly simulates a local Ollama and OpenAI API endpoint.

Any requests made to this proxy are transparently and securely forwarded over the P2P connection to your Host machine, processed by the Host's Ollama instance, and returned back to the Client!
