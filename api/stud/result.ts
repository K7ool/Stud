/**
 * POST /api/stud/result?site=X  (plugin writes)
 * Body: { id, response: { status, body } }
 *
 * GET /api/stud/result?site=X&id=Y  (web polls)
 *
 * Plugin posts the result for a request; web polls for it. Stateless.
 */
import { getResult, setResult } from "./cache";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";

  if (!site) {
    return cors(new Response(JSON.stringify({ error: "Missing site" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  if (req.method === "POST") {
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

    const inner = payload.response ?? payload;
    await setResult(site, id, {
      status: inner.status ?? 200,
      body: inner.body ?? null,
    });

    return cors(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  if (req.method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    if (!id) {
      return cors(new Response(JSON.stringify({ error: "Missing id" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      }));
    }

    const result = await getResult(site, id);
    if (!result) {
      return cors(new Response(null, { status: 204 }));
    }

    let parsed: any = null;
    try {
      parsed = result.body ? JSON.parse(result.body) : null;
    } catch {}

    return cors(new Response(JSON.stringify(parsed ?? { error: "Empty response" }), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response("Method not allowed", { status: 405 }));
}