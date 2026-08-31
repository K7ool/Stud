/**
 * Shared store for the stateless stud relay.
 *
 * Uses Upstash Redis (via REST API) when KV_REST_API_URL / KV_REST_API_TOKEN
 * env vars are set. Falls back to per-instance memory otherwise (which only
 * works when push/poll/respond all land on the same Edge instance).
 *
 * To set up: create a free database at https://upstash.com and add the
 * REST endpoint + token to your Vercel project's environment variables.
 */

export const config = { runtime: "edge" };

export interface Pair {
  connected: boolean;
  project: string | null;
  createdAt: number;
  pendingRequest: { id: string; path: string; body: string | null } | null;
}

export interface StoredResponse {
  status: number;
  body: string | null;
}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// In-memory fallback for local dev or when KV env vars are missing.
const memStore = new Map<string, unknown>();

async function kvCommand<T = unknown>(cmd: unknown[]): Promise<T | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: unknown };
    if (data.result === null || data.result === undefined) return null;
    return data.result as T;
  } catch {
    // Transient network / rate-limit errors must fail closed (return null) so
    // handlers can treat the miss as "not ready yet" (204) rather than 500ing.
    return null;
  }
}

async function storeGet<T>(key: string): Promise<T | null> {
  const r = await kvCommand<T | string>(["GET", key]);
  if (r === null) return null;
  if (typeof r === "string") {
    try { return JSON.parse(r) as T; } catch { return null; }
  }
  return r;
}

async function storeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await kvCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

async function storeDel(key: string): Promise<void> {
  await kvCommand(["DEL", key]);
}

function memGet<T>(key: string): T | null {
  return (memStore.get(key) as T) ?? null;
}

function memSet(key: string, value: unknown): void {
  memStore.set(key, value);
}

function memDel(key: string): void {
  memStore.delete(key);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const v = await storeGet<T>(key);
  if (v !== null) return v;
  return memGet<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    await storeSet(key, value, ttlSeconds);
  } else {
    memSet(key, value);
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    await storeDel(key);
  } else {
    memDel(key);
  }
}

export async function getPendingCommand(siteId: string): Promise<{ id: string; path: string; body: string | null } | null> {
  return cacheGet<{ id: string; path: string; body: string | null }>(`stud:cmd:${siteId}`);
}

export async function setPendingCommand(siteId: string, cmd: { id: string; path: string; body: string | null }): Promise<void> {
  await cacheSet(`stud:cmd:${siteId}`, cmd, 30);
}

export async function getResult(siteId: string, id: string): Promise<{ status: number; body: string | null } | null> {
  return cacheGet<{ status: number; body: string | null }>(`stud:res:${siteId}:${id}`);
}

export async function setResult(siteId: string, id: string, result: { status: number; body: string | null }): Promise<void> {
  await cacheSet(`stud:res:${siteId}:${id}`, result, 60);
}

export async function clearPendingCommand(siteId: string): Promise<void> {
  await cacheDel(`stud:cmd:${siteId}`);
}

/**
 * Connection session — the server-side source of truth for a given siteId.
 *
 * There is exactly ONE canonical identifier across the whole system: `siteId`
 * (the 16-char value this browser stores in localStorage and that every
 * generated plugin embeds into its POLL_URL). The plugin registers a session
 * on load (handshake) and refreshes `lastSeen` on every poll (heartbeat).
 *
 * The frontend derives REAL Studio connectivity from this session's freshness,
 * entirely separate from "is the bridge available".
 */
export interface ConnectionSession {
  siteId: string;
  pluginVersion: string;
  baseUrl: string;        // the backend base the plugin is polling (encodes env/deploy)
  lastSeen: number;       // ms epoch of the most recent heartbeat
  registeredAt: number;
  studio: boolean;        // plugin confirmed Studio is connected & answering
  placeName?: string;
  placeId?: string;
}

// How fresh a heartbeat must be for the connection to count as Studio-connected.
export const CONNECTION_TIMEOUT_MS = 15_000;
// Sessions older than this are considered expired.
const SESSION_TTL = 120;

export async function getConnection(siteId: string): Promise<ConnectionSession | null> {
  return cacheGet<ConnectionSession>(`stud:conn:${siteId}`);
}

export async function setConnection(session: ConnectionSession): Promise<void> {
  await cacheSet(`stud:conn:${session.siteId}`, session, SESSION_TTL);
}

export async function deleteConnection(siteId: string): Promise<void> {
  await cacheDel(`stud:conn:${siteId}`);
}

/**
 * Returns whether the connection session for a siteId is currently fresh enough
 * to be considered an active, live Studio connection.
 */
export async function isConnectionAlive(siteId: string): Promise<boolean> {
  const conn = await getConnection(siteId);
  if (!conn) return false;
  return Date.now() - conn.lastSeen < CONNECTION_TIMEOUT_MS;
}

// ---- Active-sites index ------------------------------------------------
// A self-evicting map of every siteId whose plugin heartbeated recently. Lets
// the frontend distinguish "no plugin anywhere" from "the plugin is connected
// to a DIFFERENT site than this browser." Stored as one JSON blob so it works
// with both Upstash and the in-memory fallback.

const ACTIVE_SITES_KEY = "stud:activeSites";
const ACTIVE_SITES_TTL = 60; // seconds
const STALE_SITE_MS = 20_000; // a site is "active" if it heartbeated within this window

export async function markActiveSite(siteId: string): Promise<void> {
  const map = await cacheGet<Record<string, number>>(ACTIVE_SITES_KEY) ?? {};
  map[siteId] = Date.now();
  await cacheSet(ACTIVE_SITES_KEY, map, ACTIVE_SITES_TTL);
}

/**
 * Returns the siteIds whose plugin heartbeated within STALE_SITE_MS, excluding
 * `exclude`. Lets the browser learn that some OTHER site's plugin is live.
 */
export async function getOtherActiveSites(exclude?: string): Promise<string[]> {
  const map = await cacheGet<Record<string, number>>(ACTIVE_SITES_KEY);
  if (!map) return [];
  const now = Date.now();
  const out: string[] = [];
  for (const [site, ts] of Object.entries(map)) {
    if (site === exclude) continue;
    if (now - ts < STALE_SITE_MS) out.push(site);
  }
  return out;
}