/**
 * GET /api/stud/conn?site=X
 *
 * Returns the full connection session diagnostic for a siteId. This is what the
 * frontend uses to determine REAL Studio connectivity — NOT "is the bridge up".
 *
 * Response:
 * {
 *   site,
 *   connected,      // session exists AND heartbeat is fresh
 *   exists,         // a plugin has registered/handshaked at least once
 *   session,        // { pluginVersion, baseUrl, lastSeen, registeredAt, placeName, placeId }
 *   minPluginVersion,
 *   outdated,       // pluginVersion is present but older than minPluginVersion
 *   serverBase,     // current deployment origin (compare against session.baseUrl)
 *   oldBackend      // session.baseUrl differs from serverBase → stale deployment URL
 * }
 *
 * No sensitive tokens are exposed.
 */
import { getConnection, isConnectionAlive, CONNECTION_TIMEOUT_MS, getOtherActiveSites, isKvConfigured } from "./cache";
import { PLUGIN_VERSION, MIN_PLUGIN_VERSION } from "./version";

export const config = { runtime: "edge" };

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function versionAtLeast(v: string, min: string): boolean {
  const parse = (s: string) => s.split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(v); const b = parse(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";
  const serverBase = url.origin;

  if (!/^[a-z0-9]{16}$/.test(site)) {
    return cors(new Response(JSON.stringify({ error: "Invalid site id" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    }));
  }

  const exists = await getConnection(site);
  const connected = await isConnectionAlive(site);
  const otherActiveSites = exists
    ? []
    : await getOtherActiveSites(site);
  const sharedStore = isKvConfigured();

  let outdated = false;
  let oldBackend = false;
  if (exists) {
    if (exists.pluginVersion) {
      outdated = !versionAtLeast(exists.pluginVersion, MIN_PLUGIN_VERSION);
    }
    if (exists.baseUrl && serverBase) {
      oldBackend = !normalizeBase(exists.baseUrl).startsWith(normalizeBase(serverBase));
    }
  }

  return cors(new Response(JSON.stringify({
    site,
    connected,
    exists: !!exists,
    // If the plugin is connected to a different site than the browser, report
    // that so the UI can say "site mismatch" rather than a generic disconnect.
    otherActiveSites,
    timeoutMs: CONNECTION_TIMEOUT_MS,
    serverVersion: PLUGIN_VERSION,
    minPluginVersion: MIN_PLUGIN_VERSION,
    outdated,
    oldBackend,
    serverBase,
    // Whether the relay's commands/results/sessions are stored in a shared
    // store (Upstash Redis) visible to every function instance. When false the
    // relay falls back to per-instance memory, so a plugin can appear connected
    // while requests never round-trip.
    sharedStore,
    session: exists
      ? {
          pluginVersion: exists.pluginVersion,
          baseUrl: exists.baseUrl,
          lastSeen: exists.lastSeen,
          ageMs: Date.now() - exists.lastSeen,
          registeredAt: exists.registeredAt,
          placeName: exists.placeName ?? null,
          placeId: exists.placeId ?? null,
        }
      : null,
  }), {
    status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }));
}

function normalizeBase(b: string): string {
  return (b || "").replace(/\/+$/, "").toLowerCase();
}
