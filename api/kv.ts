/**
 * Shared KV helpers. Uses Vercel KV (Redis) when env vars are set,
 * falls back to in-memory Map for local dev.
 *
 * On Vercel: create a KV store in the dashboard and bind it to this
 * project. The KV_REST_API_URL and KV_REST_API_TOKEN env vars are
 * injected automatically.
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

const memStore = new Map<string, unknown>();

export async function kvGet<T = Pair>(key: string): Promise<T | null> {
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result: string | null };
      if (!data.result) return null;
      return JSON.parse(data.result) as T;
    } catch {
      return memGet<T>(key);
    }
  }
  return memGet<T>(key);
}

export async function kvSet<T = Pair>(key: string, value: T, ttlSeconds = 1800): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: JSON.stringify(value),
          ex: ttlSeconds,
        }),
      });
      return;
    } catch {
      memSet(key, value);
      return;
    }
  }
  memSet(key, value);
}

export async function kvDel(key: string): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      return;
    } catch {
      memDel(key);
      return;
    }
  }
  memDel(key);
}

function memGet<T>(key: string): T | null {
  return (memStore.get(key) as T) ?? null;
}

function memSet<T>(key: string, value: T): void {
  memStore.set(key, value);
}

function memDel(key: string): void {
  memStore.delete(key);
}