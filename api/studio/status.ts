/**
 * GET /api/studio/status?code=XXXXXX
 * Returns { connected, project }.
 */
export const config = { runtime: "edge" };

const PAIRS: Map<string, { connected: boolean; project: string | null; createdAt: number }> =
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
  const entry = PAIRS.get(code);

  return cors(new Response(JSON.stringify({
    connected: !!entry?.connected,
    project: entry?.project ?? null,
  }), { status: 200, headers: { "Content-Type": "application/json" } }));
}