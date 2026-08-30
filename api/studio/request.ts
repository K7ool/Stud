/**
 * POST /api/studio/request
 * Header: X-Pair-Code: XXXXXX
 * Body:   { path, body }
 *
 * Queues a request for the plugin to pick up on its next /api/studio/poll,
 * and waits (up to 60s) for /api/studio/respond to deliver the result.
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

const REQUEST_TIMEOUT_MS = 60_000;

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const code = (req.headers.get("x-pair-code") ?? "").toUpperCase();
  const entry = PAIRS.get(code);

  if (!entry) {
    return cors(new Response(JSON.stringify({ error: "Invalid or expired pairing code" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
  }
  if (!entry.connected) {
    return cors(new Response(JSON.stringify({ error: "Studio plugin not connected" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    }));
  }
  if (entry.pendingRequest) {
    return cors(new Response(JSON.stringify({ error: "Plugin busy with another request" }), {
      status: 429, headers: { "Content-Type": "application/json" },
    }));
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return cors(new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  const path = payload.path;
  if (!path) {
    return cors(new Response(JSON.stringify({ error: "Missing path" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now().toString(36));

  const body = typeof payload.body === "string" ? payload.body : null;

  return cors(new Promise<Response>((resolve) => {
    const timer = setTimeout(() => {
      entry.pendingResolvers.delete(id);
      entry.pendingRequest = null;
      resolve(new Response(JSON.stringify({ id, error: "Studio request timed out" }), {
        status: 504, headers: { "Content-Type": "application/json" },
      }));
    }, REQUEST_TIMEOUT_MS);

    entry.pendingResolvers.set(id, (response: any) => {
      clearTimeout(timer);
      let parsed: any;
      try {
        parsed = response.body ? JSON.parse(response.body) : null;
      } catch {
        parsed = null;
      }
      resolve(new Response(JSON.stringify(parsed ?? { error: "Empty response" }), {
        status: response.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }));
    });

    entry.pendingRequest = { id, path, body };
  }));
}