# BSN-2A AI Notes — Cloudflare Worker

This Worker replaces the Firebase AI function.

Architecture:

GitHub Pages → Cloudflare Worker → OpenAI Responses API

Cloudflare Workers supports encrypted per-Worker secrets, exposed through the Worker `env` object. Do not put API keys in `wrangler.toml` or GitHub. citeturn216336search0turn216336search8

## Deploy

From the `cloudflare-ai` directory:

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AI_NOTES_PROXY_TOKEN
```

After deployment Cloudflare will show the Worker URL, normally something like:

```text
https://bsn-2a-ai-notes.<your-account-subdomain>.workers.dev
```

Paste that exact URL into the AI Note Builder under Secure AI Proxy.

The Worker only accepts requests from `https://jhanz3474-cmyk.github.io` and requires the `x-ai-proxy-token` header.

OpenAI recommends the Responses API for new integrations. citeturn838462search0