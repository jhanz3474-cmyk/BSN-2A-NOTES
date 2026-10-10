# AI Notes backend

The AI Note Builder uses a Cloudflare Worker. Firebase is not used for AI generation.

## Architecture

`GitHub Pages → Cloudflare Worker → OpenAI Responses API`

The Worker keeps `OPENAI_API_KEY` and `AI_NOTES_PROXY_TOKEN` as Cloudflare Worker secrets. Cloudflare exposes encrypted secrets to the Worker through `env`; do not commit secret values. citeturn216336search0turn216336search8

## One-time deployment

Open the `cloudflare-ai` folder in a terminal:

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put AI_NOTES_PROXY_TOKEN
```

After deployment, Cloudflare will show the Worker URL. It will normally look like:

```text
https://bsn-2a-ai-notes.<your-account-subdomain>.workers.dev
```

Copy that exact URL into **Admin → AI Note Builder → Secure AI Proxy** and enter the proxy token.

Then press **Test Connection**.

## Security

The Worker only accepts the GitHub Pages origin `https://jhanz3474-cmyk.github.io` and requires the `x-ai-proxy-token` header.

The OpenAI API key never reaches the browser.

The Worker calls the OpenAI Responses API. OpenAI's current guidance uses Responses for new integrations. citeturn838462search0

Do not paste real patient identifiers into shared nursing notes.