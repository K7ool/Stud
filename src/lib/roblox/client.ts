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
const TIMEOUT_MS = 60_000;
const RESULT_POLL_MS = 100;

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
    return studioRequestViaRelay<T>(endpoint, data);
  }
  return studioRequestViaLocal<T>(endpoint, data);
}

async function studioRequestViaRelay<T>(
  endpoint: string,
  data?: object,
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

  // Poll for result
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RESULT_POLL_MS));
    try {
      const res = await fetch(
        `${RELAY_BASE}/api/stud/result?site=${site}&id=${id}`,
        { method: "GET" },
      );
      if (res.status === 200) {
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
    // We can't know for sure without polling, but assume yes if a siteId
    // exists. The actual call will fail fast if no plugin is listening.
    return !!getSiteId();
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
