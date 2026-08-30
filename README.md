# Stud Web Demo

A static, Vercel-deployable demo of the Stud AI chat interface for Roblox development.

This is a **frontend-only** copy of the [Stud desktop app](../). The Tauri Rust bridge and the Roblox Studio plugin are intentionally omitted — they cannot run on Vercel. The deployed site renders the chat UI but the Roblox tools will show a "not connected" message.

## Deploy to Vercel

1. Push this `output/` folder to a Git repo (or move it to its own repo).
2. Import the repo in [Vercel](https://vercel.com/new).
3. Vercel auto-detects Vite. No config changes needed.
4. (Optional) Add environment variables:
   - `VITE_STUD_API_URL` — leave unset to fall back to localhost. The web demo will not reach a real Studio without the Tauri desktop app.

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # → dist/
```

## What works on the web

- Chat UI (messages, streaming, tool-call display, reasoning)
- Settings (theme, model selection, provider keys stored locally)
- Prompt suggestions, file browser (mock), code blocks, markdown rendering
- AI requests via the Vercel AI SDK (requires your own provider API keys configured in Settings)
- ChatGPT Plus/Pro (Codex) — proxied through `/api/codex` serverless function to bypass browser CORS restrictions on `chatgpt.com`
- Roblox Studio tools — paired via 6-character code (see below)

## Pairing the Roblox Studio plugin with the website

The Studio plugin cannot connect directly to a public website. The website acts as a relay: you generate a short pairing code, paste it into the plugin once, and the plugin polls the relay to receive commands.

**How to pair:**

1. Open the deployed website (`https://stud-weld.vercel.app`)
2. Click **Connect Studio** in the header — a 6-character code appears (e.g. `A3K9PQ`)
3. In Roblox Studio, open the `stud-bridge` plugin's dock widget
4. Find the **Pair with Web App** section, type the code, click **Pair**
5. The plugin starts polling the relay. The website shows "Studio: Connected" within a few seconds
6. Roblox Studio tools (`roblox_get_script`, `roblox_create`, etc.) now work from the website

**How it works under the hood:**

- `POST /api/stud/plugin?site=X` — generates a personalized plugin file with the user's siteId baked in
- `POST /api/stud/push?site=X` — web app queues a command
- `GET  /api/stud/cmd?site=X` — plugin polls; returns any queued command or 204
- `POST /api/stud/result?site=X` — plugin posts its response
- `GET  /api/stud/result?site=X&id=Y` — web app polls for the response

Commands and results are stored in **Upstash Redis** (free tier, REST API). The relay is stateless otherwise.

**Upstash Redis setup (free, 2 minutes):**

1. Sign up at https://upstash.com (or use the agent-created DB)
2. Create a Redis database, pick a region close to your users
3. Copy the **REST URL** and **REST Token** from the database details
4. In Vercel dashboard → your project → **Settings** → **Environment Variables**, add:
 - `KV_REST_API_URL` = your REST URL
 - `KV_REST_API_TOKEN` = your REST token
5. **Redeploy**

Without Upstash, the relay falls back to per-instance in-memory storage and only works when push/poll/respond all land on the same Edge instance. The plugin will appear connected but commands will hang.

## What does not work on the web

- All Roblox Studio tools (`roblox_get_script`, `roblox_create`, etc.) — they require the Tauri bridge to `localhost:3001`
- Studio plugin installation — that's a Roblox Studio concern
- File-system access to local Roblox projects — that requires Tauri

## Project layout

```
output/
├── src/                 # React frontend (copied from ../src)
│   ├── web-shims/       # Browser shims for @tauri-apps/* modules
│   └── ...
├── public/              # Static assets
├── index.html
├── vite.config.ts       # Aliases Tauri modules → browser shims
├── vercel.json          # SPA rewrites
└── package.json         # Web-only deps (no Tauri plugins)
```