/**
 * POST /api/stud/handshake?site=X
 * Body: { pluginVersion, base, placeName?, placeId? }
 *
 * The plugin performs this handshake on startup (and the browser on load with
 * just a siteId). It registers/refreshes the server-side connection session for
 * a siteId and returns the version + compatibility info the plugin/browser
 * need to validate the connection.
 *
 * This is the canonical "who am I and are we compatible" handshake. The backend
 * is the source of truth: it does NOT accept any plugin blindly — it validates
 * the siteId format and reports the minimum compatible plugin version so an
 * outdated plugin can be flagged rather than silently assumed to work.
 */
import { getConnection, setConnection } from "./cache";
import { PLUGIN_VERSION, MIN_PLUGIN_VERSION } from "./version";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

interface HandshakeBody {
  pluginVersion?: string;
  base?: string;
  placeName?: string;
  placeId?: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";

  if (!/^[a-z0-9]{16}$/.test(site)) {
    return cors(new Response(JSON.stringify({ error: "Invalid or missing site id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  let body: HandshakeBody = {};
  try {
    const parsed = (await req.json()) as HandshakeBody;
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {}

  const now = Date.now();
  const existing = await getConnection(site);
  const session = {
    siteId: site,
    pluginVersion: body.pluginVersion || existing?.pluginVersion || "",
    baseUrl: body.base || existing?.baseUrl || "",
    lastSeen: now,
    registeredAt: existing?.registeredAt ?? now,
    studio: true,
    placeName: body.placeName || existing?.placeName,
    placeId: body.placeId || existing?.placeId,
  };
  await setConnection(session);

  return cors(new Response(JSON.stringify({
    connected: true,
    siteId: site,
    pluginVersion: PLUGIN_VERSION,
    minPluginVersion: MIN_PLUGIN_VERSION,
    studio: true,
    // The browser can compare this to its own origin to detect an old backend URL.
    serverBase: url.origin,
  }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}
