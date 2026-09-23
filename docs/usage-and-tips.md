# Usage & Tips

Once GhostCompute is connected, your Client machine will automatically spin up an OpenAI-compatible API proxy on `http://127.0.0.1:11434`. This means you can point *any* OpenAI-compatible tool to this endpoint, and it will transparently execute on your Host machine!

## Integrating with Cursor
1. Open Cursor Settings.
2. Go to **Models**.
3. Under **OpenAI API Key**, enter any dummy string (e.g., `ghostcompute-key`).
4. Enable **Override OpenAI Base URL** and set it to `http://127.0.0.1:11434/v1`.
5. Add your Ollama models (e.g., `llama3.1:8b`) to the custom models list and enable them.

## Integrating with Claude Code
Claude Code doesn't natively support OpenAI-compatible endpoints directly without some configuration. 
Run the following in your terminal to set it up:
```bash
export OPENAI_API_KEY="ghostcompute-key"
export OPENAI_BASE_URL="http://127.0.0.1:11434/v1"
```
Now run `claude` and select the OpenAI integration.

## Troubleshooting

- **Connection Drops**: Ensure the Host machine hasn't gone to sleep.
- **Model Not Found**: Make sure the model is actually installed on the Host machine. The Host can install models by opening GhostCompute, navigating to the **Ollama** tab, and pulling the desired model.
- **Pairing Link Invalid**: Pairing links expire after 10 minutes. Generate a new one from the Host machine if it has expired.
