# Stud Project Reference

Consolidated source of truth for this codebase so you (the agent) do NOT need to
re-search or re-read files on every session. Read this once, then go straight to
work. If something is missing, update THIS file rather than re-deriving it.

---

## What this is

**stud-web** — a static, Vercel-deployable **React + Vite + TypeScript** web app
that is the chat UI for **Stud**, an AI coding-agent that builds/edits **Roblox**
games by driving **Roblox Studio** through a pairing-code relay.

Key fact baked in: this is a **frontend/relay copy** of the Stud desktop app.
The **Tauri Rust bridge** and the **Roblox Studio plugin** are intentionally
omitted here (they can't run on Vercel). The web UI renders the full chat
experience, connects to Roblox Studio via a **cloud relay** (Upstash Redis), and
proxies AI through serverless functions.

Live demo: `https://stud-weld.vercel.app`

---

## Quick commands

```bash
npm install
npm run dev       # Vite dev server (default http://localhost:3000)
npm run build     # → dist/
npm run preview   # serve the build
```

No lint/typecheck/test scripts are defined in `package.json`. There ARE
`lib/**/__tests__/*.test.ts` files, but no test runner is configured in
`package.json` scripts.

---

## Stack / dependencies

- **React 19**, **React DOM 19**, **zustand** (state), **@tanstack/react-query**
- **Vite 7**, **TypeScript ~5.8**, Tailwind **v4** (`@tailwindcss/postcss` + `@tailwindcss/typography`)
- **Vercel AI SDK** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) for LLM calls
- **Radix UI** primitives (dialog, dropdown, popover, tabs, tooltip, switch, avatar, label, slot)
- **shiki** (syntax highlighting), **react-markdown** + remark-gfm/breaks, **marked**
- **lucide-react** (icons), **sonner** (toasts), **cmdk** (command palette),
  **class-variance-authority**, **tailwind-merge**, **clsx**, **zod**, **use-stick-to-bottom**
- `next-themes` for theming; `tw-animate-css` for animations

---

## Directory layout (authoritative)

```
output/                     ← this repo root
├── src/                    ← React frontend
│   ├── App.tsx / main.tsx / index.css / vite-env.d.ts
│   ├── components/
│   │   ├── chat/           ← chat, sidebar, task panel, model selector, game map/graph
│   │   │   ├── Sidebar.tsx, TaskPanel.tsx, GameMap.tsx, GameGraphCanvas.tsx,
│   │   │   ├── InstanceTree.tsx, InstancePicker.tsx, IntentSuggestions.tsx,
│   │   │   ├── MemoryDialog.tsx, ModelSelector.tsx, QuestionPrompt.tsx,
│   │   │   ├── ContextChips.tsx, DiffView.tsx, ConnectionPopup.tsx,
│   │   │   ├── ExecutionModeSelector.tsx, TodoCard.tsx, ToolboxAssetCard.tsx
│   │   ├── ui/             ← design-system primitives (button, dialog, message, tool-call, etc.)
│   │   │   ├── tool-call.tsx, tool-activity-group.tsx, execution-status-badge.tsx,
│   │   │   ├── execution-result-card.tsx, live-progress-indicator.tsx,
│   │   │   ├── code-block.tsx, markdown.tsx, prompt-input.tsx, response-stream.tsx,
│   │   │   ├── reasoning.tsx, message.tsx, task-result-card.tsx, task-execution-result.tsx,
│   │   │   ├── chat-container.tsx, file-upload.tsx, ... (radix wrappers)
│   │   ├── admin/AdminDashboard.tsx
│   │   ├── auth/AuthModal.tsx
│   │   ├── icons/ (Avatars, Icon, Logo, ProviderIcon)
│   │   ├── prereq/PrereqWizard.tsx + index.ts
│   │   ├── settings/SettingsDialog.tsx
│   │   └── root components: CommandPalette, ConnectionStatus, EmptyState,
│   │       file-browser, QuickActions, SettingsPanel, template-picker,
│   │       ToolboxSearch, TypingIndicator, WelcomeCard
│   ├── pages/Home.tsx      ← main chat page (renders messages → ExecutionResultCard
│   │                          → ToolActivityGroup → MessageContent order)
│   ├── stores/             ← zustand stores
│   │   ├── chat.ts         ← CORE chat store (messages, toolCalls, ExecutionResult,
│   │   │                      sessions, persistence + server sync) — see below
│   │   ├── auth.ts, models.ts, settings.ts, roblox.ts, plugin.ts, tasks.ts,
│   │   │   memory.ts, gameMap.ts, persistence.ts, prereq.ts, userAuth.ts
│   ├── hooks/              ← useChatResilience, useConnectionMonitor,
│   │                          useKeyboardShortcuts, useTheme
│   ├── lib/
│   │   ├── chat/api.ts     ← client for /api/chat
│   │   ├── roblox/         ← client.ts, tools.ts (the Roblox tool registry), index.ts,
│   │   │                      cache.ts, toolbox.ts, knowledge.ts, project-analyzer.ts,
│   │   │                      specialist-router.ts, system-prompt-enhanced.ts
│   │   ├── ai/             ← providers, codex-chat, openrouter/opencode models, todo,
│   │   │                      complexity, effort, prompt-improver, memory-extract, errors,
│   │   │                      roblox-integration
│   │   ├── models/         ← fetcher, index, opencode, openrouter, types
│   │   ├── auth/           ← index, codex (OpenAI/Codex sign-in)
│   │   ├── toolbox/        ← client, popular-assets, types
│   │   └── file-ops.ts, game-analysis.ts, intents.ts, project-templates.ts,
│   │       connection-manager.ts, connection-monitor.ts, utils.ts
│   └── web-shims/          ← browser shims for @tauri-apps/* (fs, http, dialog, opener, core)
│                              wired in vite.config.ts via aliases
├── api/                    ← Vercel serverless functions (Node)
│   ├── chat.ts             ← persistent chat messages/conversations (backed by KV)
│   ├── _chat/db.ts         ← chat persistence lib
│   ├── codex.ts            ← proxies /api/codex to chatgpt.com (bypass browser CORS)
│   ├── opencode.ts
│   ├── game-map/suggestions.ts
│   ├── stud/               ← the Roblox Studio pairing RELAY
│   │   ├── site.ts         ← generate siteId
│   │   ├── handshake.ts    ← plugin <-> web handshake
│   │   ├── plugin.ts       ← generate personalized plugin file (bakes in siteId)
│   │   ├── push.ts         ← web queues a command
│   │   ├── cmd.ts          ← plugin polls for queued command
│   │   ├── result.ts       ← plugin posts result / web polls result
│   │   ├── cache.ts        ← relay storage abstraction (Upstash Redis or in-memory)
│   │   └── version.ts
│   └── toolbox/search.ts, toolbox/assets/[id].ts
├── public/                 ← static (fonts Maxi.ttf, Raster.ttf, svgs)
├── index.html
├── vite.config.ts          ← aliases @tauri-apps/* → src/web-shims/*
├── vercel.json             ← SPA rewrites
├── package.json, tsconfig.json, tsconfig.node.json, postcss.config.js
├── .env.example            ← document env vars (OPTIONAL; see below)
└── *.md                    ← many docs (see Docs map)
```

---

## The core chat data model — `src/stores/chat.ts`

Key types (all in this one store). **Read this file before touching chat UI.**

```ts
ToolCall { id, name, args, result?, status: "pending"|"running"|"complete"|"error"|"waiting",
           error?, duration?, requestId? }

ExecutionIssue { stepId?, message, reason?, retryable?, target? }

ExecutionResult { taskId?, status: "completed"|"partial"|"failed"|"blocked"|"cancelled"|"in_progress",
                  title, summary, progress?: {completed,total}, changes?: string[],
                  verification?: string[], issues?: ExecutionIssue[], nextAction? }

Message { id, role: "user"|"assistant"|"system"|"tool", content, toolCalls?: ToolCall[],
          executionResult?: ExecutionResult, contextChips?: string[], attachments?,
          createdAt }

ChatSession { id, title, messages[], createdAt, updatedAt, lastMessageAt?, status }
```

Key store actions: `createSession/switchSession/deleteSession/updateSessionTitle/archiveSession`,
`addMessage/updateMessage/clearMessages`, `addToolCall/updateToolCall`, `setStreaming/setError`,
`addAttachment/removeAttachment`, `setPendingQuestion/answerQuestion`,
`updateExecutionResult/updateExecutionStatus`, `hydrateFromServer`, `getCurrentMessages`.

Persistence:
- **localStorage** key `stud-chat-storage` — instant cold-start, throttled 1.5s, flushed on `pagehide`/`beforeunload`
- **server** sync via `apiListConversations/apiGetMessages/apiAppendMessages/apiSetMessages/apiCreateConversation/apiPatchConversation/apiDeleteConversation` (debounced 800ms)
- One "project" per bridge: conversation `projectId` defaults to `localStorage["stud:siteId"]`, else `"default"`
- Client user id from `getClientUserId()`; `uid === "ssr"` short-circuits hydrate so local cache wins

---

## Roblox integration — `src/lib/roblox/`

`index.ts` re-exports the public API (client + tools). The Roblox **tool registry**
lives in `src/lib/roblox/tools.ts`:

- `robloxGetScript`, `robloxSetScript`, `robloxEditScript`
- `robloxGetChildren`, `robloxGetProperties`, `robloxSetProperty`
- `robloxCreate`, `robloxDelete`, `robloxClone`, `robloxSearch`
- `robloxGetSelection`, `robloxRunCode`, `robloxMove`
- `robloxBulkCreate`, `robloxBulkDelete`, `robloxBulkSetProperty`
- `robloxGetGameInfo`

Client (`client.ts`) exports: `studioRequest`, `isStudioConnected`, `isBridgeRunning`,
`notConnectedError`, `getStudioSiteId`, `getGameInfo`, `isRelaySiteActive`,
`getConnectionDiagnostics`, `cachedStudioRequest`, `invalidateCache`.

Connection model (two layers — IMPORTANT for diagnosing "connected but no Studio"):
1. **Bridge** — local Tauri bridge at `VITE_STUD_API_URL` (default `http://localhost:3001`). NOT present in this web build.
2. **Studio** — the Roblox Studio plugin, connected through the **cloud relay** (Upstash Redis) via pairing code.

Also present: `cache.ts` (loop cache), `knowledge.ts`, `project-analyzer.ts`,
`specialist-router.ts`, `system-prompt-enhanced.ts`, `toolbox.ts`.

---

## Studio pairing relay — the `api/stud/*` flow

The web app + Studio plugin talk through the relay. Storage abstracted in `api/stud/cache.ts`
(Upstash Redis REST when `KV_REST_API_URL`+`KV_REST_API_TOKEN` set, else in-memory
per-instance — which breaks on multi-instance Vercel).

```
POST /api/stud/plugin?site=X   generate personalized plugin file (siteId baked in)
POST /api/stud/push?site=X     web queues a command
GET  /api/stud/cmd?site=X      plugin polls → returns queued command (204 if none)
POST /api/stud/result?site=X   plugin posts its response
GET  /api/stud/result?site=X&id=Y  web polls for the response
POST /api/stud/handshake       plugin <-> web handshake
GET/POST /api/stud/site        generate siteId
GET  /api/stud/version
```

Pairing UX (in the app): header **Connect Studio** → shows a 6-char code (e.g. `A3K9PQ`)
→ plugin's **Pair with Web App** field → pair. Web shows "Studio: Connected" once the
plugin polls in. All `roblox_*` tools then work from the website.

---

## AI / chat plumbing

- **`api/chat.ts`** — persistent conversation/message API (serverless). Backed by `api/_chat/db.ts` (KV).
- **`api/codex.ts`** — proxies `/api/codex` to `chatgpt.com` to bypass browser CORS for ChatGPT Plus/Pro (Codex).
- **`api/opencode.ts`** — opencode model proxy.
- Client model layer: `src/lib/models/*` (fetch, opencode/openrouter providers, types).
- Codex auth: `src/lib/auth/*` (device-code flow by default; optional OAuth via
  `VITE_CODEX_CLIENT_ID` + `VITE_CODEX_REDIRECT_URI`).
- AI extras: `src/lib/ai/*` (providers, complexity, effort, todo, prompt-improver,
  memory-extract, roblox-integration, errors, codex-chat).
- Streaming tool/execution UI references: tool calls stream in via `Message.toolCalls`
  and `Message.executionResult`; rendered by `ExecutionResultCard` +
  `ToolActivityGroup` in `pages/Home.tsx` (see ExecutionResult section below).

---

## Environment variables (ALL OPTIONAL) — `.env.example`

- `VITE_STUD_API_URL` — override the Stud bridge URL (default `http://localhost:3001`). Leave unset on Vercel.
- `KV_REST_API_URL` — Upstash Redis REST URL (**required on Vercel** for the relay to be reliable).
- `KV_REST_API_TOKEN` — Upstash Redis REST token.
- `VITE_CODEX_CLIENT_ID` + `VITE_CODEX_REDIRECT_URI` — only if you register your own OpenAI OAuth client
  (turns on OAuth redirect auth; otherwise device-code flow is used automatically).

Without Upstash, hot-reload chat persistence still works (in-memory per instance) but the
**Studio relay requires a shared store** or commands hang ("Bridge connected but Studio not connected").

---

## Docs map (root *.md files)

| File | Purpose |
|------|---------|
| `STUD_PROJECT.md` | **THIS FILE** — consolidated reference (read first) |
| `README.md` | Product summary, deploy + pairing instructions |
| `DOCUMENTATION_INDEX.md` | Navigation index for the execution-UI docs |
| `IMPLEMENTATION_COMPLETE.md` | Summary of the professional execution-UI build (28 reqs) |
| `UI_TRANSFORMATION_SUMMARY.md` | Before/after of the UI transformation |
| `TASK_EXECUTION_UI_GUIDE.md` | How agents should produce `ExecutionResult` |
| `QUICK_START_EXECUTION_UI.md` | Quick reference for `ExecutionResult` |
| `ARCHITECTURE_DIAGRAM.md` | Component hierarchy + data flow of execution UI |
| `ROBLOX_UPGRADE_DOCUMENTATION.md`, `UPGRADE_SUMMARY.md` | Earlier Roblox upgrade notes |

---

## ExecutionResult UI (the "professional coding-agent" display)

Message render order in `pages/Home.tsx`:
1. `ExecutionResultCard` (if `message.executionResult`)
2. `ToolActivityGroup` (if `message.toolCalls`) — collapsed by default
3. `MessageContent` (always)

Components: `src/components/ui/execution-status-badge.tsx`,
`execution-result-card.tsx`, `tool-activity-group.tsx`, `live-progress-indicator.tsx`,
`tool-call.tsx` (supports `duration`). Status badges: ✓/◐/✕/⏸/⏹/◉ with semantic colors.

---

## Recurring gotchas / things to remember in THIS repo

1. **No Tauri bridge here** — `src/web-shims/*` shim `@tauri-apps/*` modules; `vite.config.ts`
   aliases them. Don't add real Tauri deps unless you also add shims.
2. **Roblox tools only work when a Studio is paired through the relay**; web-only demo shows "not connected".
3. **Relay needs Upstash Redis** (`KV_REST_API_URL`/`KV_REST_API_TOKEN`) to work reliably on Vercel.
4. **Chat store file is large** — `src/stores/chat.ts` (~645 lines) is the single source of truth
   for messages/tools/execution results. Read it before editing chat UI logic.
5. **No test/lint scripts configured** — verify via `npm run build` (TypeScript check) + manual playtest.
6. **Path alias `@/`** → `src/` (configured in `tsconfig.json` / `vite.config.ts`).

---

## Where to add new features (quick lookup)

- **New chat UI element** → `src/components/chat/` or `src/components/ui/` + wire into `pages/Home.tsx`
- **New Roblox tool** → add to registry in `src/lib/roblox/tools.ts` + re-export in `src/lib/roblox/index.ts`
- **New serverless route** → add under `api/` (e.g. `api/stud/*` for relay, `api/chat` for persistence)
- **New state** → zustand store under `src/stores/`
- **New AI provider** → `src/lib/models/*` + `src/lib/ai/providers.ts`
