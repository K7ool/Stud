/**
 * POST /api/stud/push?site=X
 * Body: { id, path, body }
 *
 * Web app pushes a command. The next plugin poll on /api/stud/cmd will pick it
 * up. Stateless — just writes to the shared cache.
 */
import { setPendingCommand } from "./cache";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (req.method !== "POST") return cors(new Response("POST required", { status: 405 }));

  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";

  if (!site) {
    return cors(new Response(JSON.stringify({ error: "Missing site" }), {
      status: 400, headers: { "Content-Type": "application/json" },
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

  if (!payload.id || !payload.path) {
    return cors(new Response(JSON.stringify({ error: "Missing id or path" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  await setPendingCommand(site, {
    id: payload.id,
    path: payload.path,
    body: typeof payload.body === "string" ? payload.body : null,
  });

  return cors(new Response(JSON.stringify({ ok: true, id: payload.id }), {
    status: 202, headers: { "Content-Type": "application/json" },
  }));
}