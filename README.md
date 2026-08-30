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

- `POST /api/pair/create` — generates the code, stores `{code → connected:false}` in Vercel KV
- `GET  /api/studio/poll?code=...` — poll loop; marks the pair as connected, returns queued requests
- `POST /api/studio/respond?code=...` — plugin posts results back into KV
- `POST /api/studio/request` — web app queues a command and polls KV for the plugin's response (60s timeout)

Pairings live in **Vercel KV** so they survive across Edge function instances and cold starts. **You must create a KV store and bind it to your project** — without it, pairings only work within a single Edge instance and will appear "connected" then immediately "disconnected" as traffic splits across instances.

**Vercel KV setup:**

1. Go to https://vercel.com/dashboard → your project → **Storage** tab
2. Click **Create Database** → **KV**
3. Pick a region close to your users
4. Click **Connect** → choose your Stud project
5. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your project's environment
6. Redeploy — the relay now uses shared KV

Without KV, the code falls back to per-instance in-memory state and pairings will be inconsistent across Edge regions.

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