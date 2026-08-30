/**
 * POST /api/pair/create
 * Creates a fresh 6-character pairing code valid for 5 minutes.
 * Returns { code, expiresAt }.
 *
 * Module-scope Map is shared via globalThis to survive HMR within a single
 * Edge instance lifetime. Edge cold starts will reset pairings — acceptable
 * because each code is short-lived.
 */
export const config = { runtime: "edge" };

const PAIRS: Map<string, { connected: boolean; project: string | null; createdAt: number }> =
  ((globalThis as any).__STUD_PAIRS ??= new Map());

const PAIR_TTL_MS = 5 * 60_000;

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Pair-Code");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const now = Date.now();
  for (const [code, entry] of PAIRS) {
    if (!entry.connected && now - entry.createdAt > PAIR_TTL_MS) {
      PAIRS.delete(code);
    }
  }

  const code = genCode();
  PAIRS.set(code, { connected: false, project: null, createdAt: now });

  return cors(new Response(JSON.stringify({ code, expiresAt: now + PAIR_TTL_MS }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}