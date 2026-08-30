/**
 * POST /api/studio/respond?code=XXXXXX
 * Body: { id, status, body }
 *
 * Called by the plugin to deliver the response to a previously polled
 * request. Resolves the HTTP call waiting in /api/studio/request.
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

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();

  if (req.method !== "POST") {
    return cors(new Response("POST required", { status: 405 }));
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return cors(new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  const id = payload.id;
  if (!id) {
    return cors(new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  const entry = PAIRS.get(code);
  if (!entry) {
    return cors(new Response(JSON.stringify({ error: "Unknown pair" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    }));
  }

  const resolver = entry.pendingResolvers.get(id);
  if (resolver) {
    entry.pendingResolvers.delete(id);
    // The plugin wraps its reply as { id, response: { status, body } }.
    // Unwrap to keep the protocol symmetric with the original /stud/respond.
    const inner = payload.response ?? payload;
    resolver({
      id,
      status: inner.status ?? 200,
      body: inner.body ?? null,
    });
    return cors(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response(JSON.stringify({ ok: true, late: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}