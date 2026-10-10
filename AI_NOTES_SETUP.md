# AI Notes backend

The GitHub Pages frontend already contains the admin-only AI Note Builder. The real model call is intentionally kept off the public page.

## What this backend does

- Firebase Cloud Function in `asia-southeast1`
- Calls the OpenAI Responses API from the server
- Keeps the OpenAI API key in Firebase Secret Manager
- Requires a separate AI proxy token
- Returns a structured note draft for Nursing Notes or School Notes
- The frontend reviews the draft before anything is saved

OpenAI's current JavaScript SDK uses the Responses API for primary model calls. The official SDK is published as the `openai` npm package. Firebase recommends Secret Manager-backed parameters for sensitive function configuration. citeturn268735search2turn349157search0turn959251search0

## One-time deployment

From a local clone of this repository:

```bash
npm install -g firebase-tools
firebase login
firebase use bsn-2a-notes

cd functions
npm install
cd ..

firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set AI_NOTES_PROXY_TOKEN

firebase deploy --only functions:aiNotes
```

When prompted:

- `OPENAI_API_KEY` = your OpenAI API key
- `AI_NOTES_PROXY_TOKEN` = a long random admin-only token

After deployment, the endpoint is normally:

```
https://asia-southeast1-bsn-2a-notes.cloudfunctions.net/aiNotes
```

Paste that endpoint into the **AI proxy URL** field inside the admin AI Note Builder, then enter the same proxy token.

## Important

Do **not** put the OpenAI API key in `index.html`, `sw.js`, GitHub Actions logs, or any committed file. The public site should only know the function URL and the proxy token.

The existing admin password is enforced in the browser, so it should not be treated as a cryptographic identity system. The backend token is the second gate for the AI endpoint.

For the Nursing Notes tool, paste educational/shared note content only. Do not paste real patient names, hospital numbers, addresses, or other identifying information.
