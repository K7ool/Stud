/**
 * GET /api/stud/cmd?site=X[&version=V][&base=B]
 *
 * Plugin polls this. Returns the pending command (if any) for the given site,
 * or 204 No Content. Also acts as the plugin's HEARTBEAT: every poll records
 * the plugin's version + backend base and refreshes `lastSeen`, so the web app
 * can determine real Studio connectivity from session freshness.
 *
 * We don't auto-clear the command after delivery because the plugin
 * handles each id uniquely — if it receives the same command twice
 * (e.g. concurrent polls), the duplicate id means the response handler
 * will just discard the second result. Commands expire after 30s anyway.
 */
import { getPendingCommand, getConnection, setConnection, markActiveSite } from "./cache";

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
  const version = url.searchParams.get("version") ?? "";
  const base = url.searchParams.get("base") ?? "";

  if (!site) {
    return cors(new Response(JSON.stringify({ error: "Missing site" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  // Heartbeat: refresh the server-side connection session (source of truth).
  // The plugin throttles its heartbeat (~every 2s), so only write when it sends
  // identity params — this avoids hammering the backend 100ms polls.
  if (version || base) {
    const existing = await getConnection(site);
    const now = Date.now();
    await setConnection({
      siteId: site,
      pluginVersion: version || existing?.pluginVersion || "",
      baseUrl: base || existing?.baseUrl || "",
      lastSeen: now,
      registeredAt: existing?.registeredAt ?? now,
      studio: existing?.studio ?? true,
      placeName: existing?.placeName,
      placeId: existing?.placeId,
    });
    await markActiveSite(site);
  }

  const cmd = await getPendingCommand(site);
  if (cmd) {
    return cors(new Response(JSON.stringify({ request: cmd, site }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  return cors(new Response(null, { status: 204 }));
}
