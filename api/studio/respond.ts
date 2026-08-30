/**
 * POST /api/studio/respond?code=XXXXXX
 * Body: { id, response: { status, body } }
 *
 * Plugin delivers its response to a previously polled request. The pending
 * HTTP request in /api/studio/request (which polls KV for the response)
 * picks it up.
 */
import { kvGet, kvSet, kvDel, type Pair } from "../kv";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return cors;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (req.method !== "POST") return cors(new Response("POST required", { status: 405 }));

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").toUpperCase();

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

  // Store the response under a per-id key so /studio/request can pick it up.
  const inner = payload.response ?? payload;
  await kvSet(
    `resp:${code}:${id}`,
    { status: inner.status ?? 200, body: inner.body ?? null },
    60,
  );

  return cors(new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}