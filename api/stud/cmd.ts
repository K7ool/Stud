/**
 * GET /api/stud/cmd?site=X
 *
 * Plugin polls this. Returns the pending command (if any) for the given site,
 * or 204 No Content. Stateless.
 *
 * We don't auto-clear the command after delivery because the plugin
 * handles each id uniquely — if it receives the same command twice
 * (e.g. concurrent polls), the duplicate id means the response handler
 * will just discard the second result. Commands expire after 30s anyway.
 */
import { getPendingCommand } from "./cache";

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

  const cmd = await getPendingCommand(site);
  if (cmd) {
    return cors(new Response(JSON.stringify({ request: cmd }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response(null, { status: 204 }));
}