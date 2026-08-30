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