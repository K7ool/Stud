/**
 * GET /api/studio/status?code=XXXXXX
 * Returns { connected, project }.
 */
import { kvGet } from "../kv";

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
  const pair = await kvGet(code);

  return cors(new Response(JSON.stringify({
    connected: !!pair?.connected,
    project: pair?.project ?? null,
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
}