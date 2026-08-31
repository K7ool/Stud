/**
 * Roblox Studio communication — stateless Web relay.
 *
 * Protocol:
 *   1. Browser gets a random 16-char siteId (stored in localStorage).
 *   2. Plugin polls  GET  /api/stud/cmd?site=X     every 200ms
 *   3. Web app pushes POST /api/stud/push?site=X    with { id, path, body }
 *   4. Plugin executes the request, then POSTs the result to
 *      /api/stud/result?site=X  with { id, response: { status, body } }
 *   5. Web app polls GET /api/stud/result?site=X&id=Y for the response
 *
 * No pairing code, no shared state on the server — just a shared cache
 * (Vercel Edge `caches.default`) for command/result delivery.
 */

const BRIDGE_URL =
  (import.meta.env.VITE_STUD_API_URL as string | undefined) ?? "http://localhost:3001";
const RELAY_BASE =
  (import.meta.env.VITE_STUD_RELAY_URL as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin : "");
// The relay plugin polls every ~200ms and Studio executes instantly, so a
// per-request timeout of 20s is more than enough while still surfacing a
// "no plugin connected" failure promptly instead of blocking for a minute.
const WEB_TIMEOUT_MS = 20_000;
const TIMEOUT_MS = 60_000;
const RESULT_POLL_MS = 100;

// A ping only needs to confirm the plugin is alive. A short deadline turns
// "no plugin listening" into a fast failure instead of a 20s stall, and the
// result is cached so the 5s health polls don't issue a relay round-trip each.
const PING_TIMEOUT_MS = 2_500;
const PING_CACHE_MS = 4_000;

const isWebMode =
  typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

const SITE_KEY = "stud:siteId";

function getSiteId(): string {
  if (typeof localStorage === "undefined") return "";
  let id = localStorage.getItem(SITE_KEY);
  if (!id) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    id = "";
    for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
    localStorage.setItem(SITE_KEY, id);
  }
  return id;
}

export function getStudioSiteId(): string {
  return getSiteId();
}

export type StudioResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function studioRequest<T>(
  endpoint: string,
  data?: object,
): Promise<StudioResponse<T>> {
  if (isWebMode) {
    return studioRequestViaRelay<T>(endpoint, data, WEB_TIMEOUT_MS);
  }
  return studioRequestViaLocal<T>(endpoint, data);
}

async function studioRequestViaRelay<T>(
  endpoint: string,
  data?: object,
  timeoutMs: number = WEB_TIMEOUT_MS,
): Promise<StudioResponse<T>> {
  const site = getSiteId();
  if (!site) {
    return { success: false, error: "No siteId" };
  }

  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now().toString(36));

  // Push the command
  try {
    const pushRes = await fetch(`${RELAY_BASE}/api/stud/push?site=${site}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        path: endpoint,
        body: data ? JSON.stringify(data) : undefined,
      }),
    });
    if (!pushRes.ok && pushRes.status !== 202) {
      return { success: false, error: `Push failed: ${pushRes.status}` };
    }
  } catch (e) {
    return { success: false, error: `Failed to push: ${e}` };
  }

  // Fewer than expected result polls means no plugin is listening; surface the
  // "not connected" case earlier by tracking whether we've seen any 200 yet.
  let sawResult = false;

  // Poll for result
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RESULT_POLL_MS));
    try {
      const res = await fetch(
        `${RELAY_BASE}/api/stud/result?site=${site}&id=${id}`,
        { method: "GET" },
      );
      if (res.status === 200) {
        sawResult = true;
        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          return { success: false, error: `Bad response: ${text}` };
        }
        if (json.error) return { success: false, error: json.error };
        return { success: true, data: json as T };
      }
      // 204 = not ready yet, keep polling
    } catch {
      // network blip, keep polling
    }
  }

  if (!sawResult) {
    return {
      success: false,
      error: "Studio isn't responding. Check that the stud-bridge plugin is installed and connected to this site.",
    };
  }
  return { success: false, error: "Studio request timed out" };
}

async function studioRequestViaLocal<T>(
  endpoint: string,
  data?: object,
): Promise<StudioResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BRIDGE_URL}/stud/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: endpoint,
        body: data ? JSON.stringify(data) : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        return { success: false, error: json.error || `Error ${response.status}` };
      } catch {
        return { success: false, error: `Studio error ${response.status}: ${text}` };
      }
    }

    const result = await response.json();
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result as T };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { success: false, error: "Request timed out waiting for Studio response" };
    }
    return { success: false, error: `Failed to connect: ${e}` };
  } finally {
    clearTimeout(timeout);
  }
}

let _connState: { connected: boolean; at: number } | null = null;
const CONN_TTL_MS = 1_500;

export async function isStudioConnected(): Promise<boolean> {
  if (isWebMode) {
    // In web mode we can't see the relay directly, so confirm the plugin is
    // actually there with a real /ping round-trip. Short timeout + cache so the
    // 5s health polls don't each pay a full relay push/poll cycle.
    if (_connState && Date.now() - _connState.at < PING_CACHE_MS) {
      return _connState.connected;
    }
    const pong = await studioRequestViaRelay<{ status: string }>(
      "/ping",
      undefined,
      PING_TIMEOUT_MS,
    );
    const connected = pong.success;
    _connState = { connected, at: Date.now() };
    return connected;
  }

  // Short-lived cache so bursts of concurrent tool calls do not each pay a
  // bridge round-trip for a connection that is unlikely to have changed.
  if (_connState && Date.now() - _connState.at < CONN_TTL_MS) {
    return _connState.connected;
  }

  try {
    const response = await fetch(`${BRIDGE_URL}/stud/status`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) {
      _connState = { connected: false, at: Date.now() };
      return false;
    }
    const status = await response.json();
    const connected = status.connected === true;
    _connState = { connected, at: Date.now() };
    return connected;
  } catch {
    _connState = { connected: false, at: Date.now() };
    return false;
  }
}

export function notConnectedError(): string {
  if (isWebMode) {
    return `Roblox Studio is not connected.

To connect:
1. Open Roblox Studio and install the stud-bridge plugin
2. Edit the plugin's POLL_URL to point at this site:
   ${RELAY_BASE}/api/stud/cmd?site=${getSiteId()}
3. The plugin will start receiving commands immediately`;
  }

  return `Roblox Studio is not connected.

To use Roblox Studio tools:
1. Make sure Stud desktop app is running (it starts the bridge server)
2. Open Roblox Studio
3. Install the Stud plugin from studio-plugin/ folder
4. Enable the plugin in Studio
5. The plugin will automatically connect to Stud`;
}

export interface GameInfo {
  name: string;
  placeId: number;
  universeId: number;
  placeVersion: number;
  creatorName: string;
  creatorType: string;
  playerCount: number;
  playability: string;
  description: string;
}

export async function getGameInfo(): Promise<GameInfo | null> {
  if (isWebMode) {
    // Use the relay push/poll protocol (same as studioRequest). The direct
    // /api/stud/request route does not exist on the relay and returns 405.
    if (!getSiteId()) return null;
    const res = await studioRequest<GameInfo>("/game/info");
    return res.success ? res.data : null;
  }

  try {
    const response = await fetch(`${BRIDGE_URL}/stud/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/game/info" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data as GameInfo;
  } catch {
    return null;
  }
}

export async function isBridgeRunning(): Promise<boolean> {
  if (isWebMode) return true;
  try {
    const response = await fetch(`${BRIDGE_URL}/stud/status`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Web mode only: asks the relay whether a plugin is actively polling for the
 * given siteId. Lets the UI detect a site mismatch — a plugin connected to a
 * different site than this browser expects — so it can prompt a re-download
 * instead of showing a generic "not connected" error.
 */
export async function isRelaySiteActive(site: string): Promise<boolean> {
  if (!isWebMode || !site) return false;
  try {
    const res = await fetch(
      `${RELAY_BASE}/api/stud/site?site=${encodeURIComponent(site)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { active?: boolean };
    return data.active === true;
  } catch {
    return false;
  }
}

/**
 * Connection diagnostics — the server-side source of truth for whether Roblox
 * Studio is ACTUALLY connected for this browser's siteId. Distinct from the
 * relay/bridge being reachable. Web mode only; local mode uses the bridge.
 */
export interface ConnectionDiagnostics {
  site: string;
  connected: boolean;
  exists: boolean;
  timeoutMs: number;
  serverVersion: string;
  minPluginVersion: string;
  outdated: boolean;
  oldBackend: boolean;
  serverBase: string;
  otherActiveSites: string[];
  session: {
    pluginVersion: string;
    baseUrl: string;
    lastSeen: number;
    ageMs: number;
    registeredAt: number;
    placeName: string | null;
    placeId: string | null;
  } | null;
}

export async function getConnectionDiagnostics(
  site: string,
): Promise<ConnectionDiagnostics | null> {
  if (!isWebMode || !site) return null;
  try {
    const res = await fetch(
      `${RELAY_BASE}/api/stud/conn?site=${encodeURIComponent(site)}`,
      { method: "GET", headers: { "Cache-Control": "no-store" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as ConnectionDiagnostics;
  } catch {
    return null;
  }
}

const _cache = new Map<string, { data: unknown; expires: number }>();
const SCRIPT_TTL = 30_000;
const INSTANCE_TTL = 5_000;

function _cachedGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _cache.delete(key); return null; }
  return entry.data as T;
}

function _cachedSet(key: string, data: unknown, ttl: number): void {
  _cache.set(key, { data, expires: Date.now() + ttl });
}

export async function cachedStudioRequest<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  ttlMs?: number,
): Promise<StudioResponse<T>> {
  const cacheKey = `${endpoint}:${params ? JSON.stringify(params) : ""}`;
  const cached = _cachedGet<T>(cacheKey);
  if (cached !== null) return { success: true, data: cached };
  const result = await studioRequest<T>(endpoint, params);
  if (result.success) {
    _cachedSet(cacheKey, result.data, ttlMs ?? (endpoint.startsWith("/script/") ? SCRIPT_TTL : INSTANCE_TTL));
  }
  return result;
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) { _cache.clear(); return; }
  for (const key of _cache.keys()) {
    if (key.includes(pattern)) _cache.delete(key);
  }
}
