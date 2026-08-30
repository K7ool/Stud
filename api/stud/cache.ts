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