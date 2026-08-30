/**
 * POST /api/pair/create
 * Creates a fresh 6-character pairing code valid for 5 minutes to claim.
 */
import { kvSet } from "./kv";

export const config = { runtime: "edge" };

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

  const code = genCode();
  const now = Date.now();
  await kvSet(code, {
    connected: false,
    project: null,
    createdAt: now,
    pendingRequest: null,
  }, 5 * 60); // 5-minute TTL to claim

  return cors(new Response(JSON.stringify({ code, expiresAt: now + 5 * 60_000 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}