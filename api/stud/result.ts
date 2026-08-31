/**
 * POST /api/stud/result?site=X  (plugin writes)
 * Body: { id, response: { status, body } }
 *
 * GET /api/stud/result?site=X&id=Y  (web polls)
 *
 * Plugin posts the result for a request; web polls for it.
 * On GET, the result is deleted so subsequent polls return 204.
 */
import { getResult, setResult, cacheDel } from "./cache";

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

    // Consume so subsequent polls return 204
    await cacheDel(`stud:res:${site}:${id}`);

    let parsed: any = null;
    if (result.body) {
      if (typeof result.body === "object") {
        parsed = result.body;
      } else if (typeof result.body === "string") {
        try {
          parsed = JSON.parse(result.body);
        } catch {
          parsed = { output: result.body, error: result.status >= 400 ? result.body : undefined };
        }
      }
    }

    return cors(new Response(JSON.stringify(parsed ?? { error: "Empty response" }), {
      status: result.status || 200,
      headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response("Method not allowed", { status: 405 }));
}