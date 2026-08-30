/**
 * GET /api/studio/poll?code=XXXXXX[&project=...]
 *
 * The Roblox plugin calls this every ~200ms.
 *   - If pair is unknown: 404.
 *   - First call (or any call): marks the pair as connected, returns any
 *     queued request from the web app.
 */
import { kvGet, kvSet, type Pair } from "../kv";

export const config = { runtime: "edge" };

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
  const project = url.searchParams.get("project");

  if (!code) {
    return cors(new Response(JSON.stringify({ error: "Missing code" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  let pair = await kvGet(code);
  if (!pair) {
    return cors(new Response(JSON.stringify({ error: "Unknown pair" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    }));
  }

  const updated: Pair = {
    ...pair,
    connected: true,
    project: project ?? pair.project,
    createdAt: Date.now(),
  };

  const requestToSend = updated.pendingRequest;
  updated.pendingRequest = null;
  await kvSet(code, updated, 30 * 60);

  if (requestToSend) {
    return cors(new Response(JSON.stringify({ request: requestToSend }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response(JSON.stringify({ request: null }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}