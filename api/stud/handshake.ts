/**
 * POST /api/stud/handshake
 * Body: { siteId?: string }
 * Returns: { siteId }
 *
 * If the browser already has a siteId in localStorage, it should pass it in.
 * The endpoint just echoes it back, validating the format. Stateless.
 */
export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function genSiteId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  let siteId: string | null = null;
  try {
    const body = (await req.json()) as { siteId?: string };
    if (body && typeof body.siteId === "string" && /^[a-z0-9]{16}$/.test(body.siteId)) {
      siteId = body.siteId;
    }
  } catch {}

  if (!siteId) siteId = genSiteId();

  return cors(new Response(JSON.stringify({ siteId }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}