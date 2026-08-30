/**
 * POST /api/studio/request
 * Header: X-Pair-Code: XXXXXX
 * Body:   { path, body }
 *
 * Queues a request for the plugin to pick up on its next /api/studio/poll,
 * then polls KV for the matching response (written by /api/studio/respond).
 */
import { kvGet, kvSet, type Pair } from "../kv";

export const config = { runtime: "edge" };

const REQUEST_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 100;

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return cors;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const code = (req.headers.get("x-pair-code") ?? "").toUpperCase();
  const pair = await kvGet(code);

  if (!pair) {
    return cors(new Response(JSON.stringify({ error: "Invalid or expired pairing code" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    }));
  }
  if (!pair.connected) {
    return cors(new Response(JSON.stringify({ error: "Studio plugin not connected" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    }));
  }
  if (pair.pendingRequest) {
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

  // Queue the request
  const updated: Pair = { ...pair, pendingRequest: { id, path, body } };
  await kvSet(code, updated, 30 * 60);

  // Poll for response
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resp = await kvGet<{ status: number; body: string | null }>(`resp:${code}:${id}`);
    if (resp) {
      // Cleanup
      try {
        const { kvDel } = await import("../kv");
        await kvDel(`resp:${code}:${id}`);
      } catch {}

      let parsed: any = null;
      try {
        parsed = resp.body ? JSON.parse(resp.body) : null;
      } catch {}

      return cors(new Response(JSON.stringify(parsed ?? { error: "Empty response" }), {
        status: resp.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
  }

  // Timeout — clear pendingRequest so future requests don't get stuck
  const cleared = await kvGet(code);
  if (cleared && cleared.pendingRequest?.id === id) {
    cleared.pendingRequest = null;
    await kvSet(code, cleared, 30 * 60);
  }

  return cors(new Response(JSON.stringify({ id, error: "Studio request timed out" }), {
    status: 504, headers: { "Content-Type": "application/json" },
  }));
}