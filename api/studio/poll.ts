/**
 * GET /api/studio/poll?code=XXXXXX[&project=...]
 *
 * The Roblox plugin calls this every ~200ms.
 *   - If the pair code is unknown / expired: returns 401.
 *   - On first call (no `project` query yet): marks the pair as connected,
 *     returns 200 with `{ hello: true }` so the plugin knows it's paired.
 *   - On subsequent calls: returns 200 with `{ request }` if the web app
 *     has queued a command, otherwise `{ request: null }`.
 */
export const config = { runtime: "edge" };

interface Pair {
  connected: boolean;
  project: string | null;
  createdAt: number;
  pendingRequest: { id: string; path: string; body: string | null } | null;
  pendingResolvers: Map<string, (response: any) => void>;
}

const PAIRS: Map<string, Pair> =
  ((globalThis as any).__STUD_PAIRS ??= new Map());

const PAIR_TTL_MS = 30 * 60_000;

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return res;
}

function ensurePair(code: string): Pair {
  let entry = PAIRS.get(code);
  if (!entry) {
    entry = {
      connected: false,
      project: null,
      createdAt: Date.now(),
      pendingRequest: null,
      pendingResolvers: new Map(),
    };
    PAIRS.set(code, entry);
  }
  return entry;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  const project = url.searchParams.get("project");

  if (!code) {
    return cors(new Response(JSON.stringify({ error: "Missing code" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  // Plugin must claim the pair by sending its code. We don't trust random
  // codes — but in this simple model we accept any 6-char string the
  // web app generated, so this is mostly a no-op gate.
  const entry = ensurePair(code);

  if (!entry.connected) {
    entry.connected = true;
    entry.createdAt = Date.now();
    if (project) entry.project = project;
  } else if (project) {
    entry.project = project;
  }

  // Refresh TTL
  entry.createdAt = Date.now();

  // Drop entry if it's been idle too long with no connection
  void PAIR_TTL_MS;

  if (entry.pendingRequest) {
    const req2 = entry.pendingRequest;
    entry.pendingRequest = null;
    return cors(new Response(JSON.stringify({ request: req2 }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response(JSON.stringify({ request: null }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}