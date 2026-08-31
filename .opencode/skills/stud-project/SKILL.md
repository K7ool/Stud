---
name: stud-project
description: Consolidates the STUD_PROJECT.md reference for the stud-web codebase so you never need to re-search or re-read the project structure, data model, relay flow, or env vars. Use whenever working in this repository (E:\Stud\stud\output) on the stud-web React/Vite Roblox Studio integration app — before exploring components, stores, api/, or planning new features.
---

# Stub: stud-web project context

Read `STUD_PROJECT.md` at the repository root. That file is the single source of
truth describing this codebase: the stack, directory layout, the core chat data
model (`src/stores/chat.ts`), the Roblox tool registry (`src/lib/roblox/tools.ts`),
the Studio pairing relay flow (`api/stud/*`), the serverless functions, env vars,
and the docs map.

Read it up front and treat it as authoritative so you don't re-search or re-read
files on every session.

## Essential orientation (from STUD_PROJECT.md)

- **What**: `stud-web` — React + Vite + TypeScript web chat UI for **Stud**, an AI agent that edits Roblox games by driving Roblox Studio through a pairing-code relay.
- **Stack**: React 19, zustand, Tailwind v4, Vercel AI SDK, Radix UI, shiki, react-markdown, Vercel serverless `api/`.
- **No Tauri bridge here** — `src/web-shims/*` shim `@tauri-apps/*`; `vite.config.ts` aliases them.
- **Core chat store**: `src/stores/chat.ts` (~645 lines) — the single source of truth for `Message`/`ToolCall`/`ExecutionResult`/`ChatSession`, plus localStorage + server persistence.
- **Roblox tools**: registry in `src/lib/roblox/tools.ts`, re-exported from `src/lib/roblox/index.ts` / `client.ts`.
- **Relay**: `api/stud/{site,handshake,plugin,push,cmd,result,cache,version}.ts` — web ↔ plugin via Upstash Redis (needs `KV_REST_API_URL`/`KV_REST_API_TOKEN` for reliable multi-instance use).
- **Chat persistence API**: `api/chat.ts` + `api/_chat/db.ts`; Codex proxy `api/codex.ts`; opencode proxy `api/opencode.ts`.
- **Env vars**: all optional — `VITE_STUD_API_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `VITE_CODEX_CLIENT_ID`, `VITE_CODEX_REDIRECT_URI`.
- **Message render order** in `pages/Home.tsx`: `ExecutionResultCard` → `ToolActivityGroup` → `MessageContent`.
- **No lint/test scripts** — verify with `npm run build` + manual playtest.
- **Path alias `@/`** → `src/`.

If you discover new facts while working, update `STUD_PROJECT.md` so future sessions inherit them.
