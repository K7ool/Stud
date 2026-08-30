/**
 * Shared KV helpers. Uses Vercel KV (Redis) when env vars are set,
 * falls back to in-memory Map for local dev.
 *
 * On Vercel: create a KV store in the dashboard and bind it to this
 * project. The KV_REST_API_URL and KV_REST_API_TOKEN env vars are
 * injected automatically. To set up:
 *   1. https://vercel.com/dashboard → Storage → Create Database → KV
 *   2. Pick a region close to your users
 *   3. Connect to your project
 */
export const config = { runtime: "edge" };

export interface Pair {
  connected: boolean;
  project: string | null;
  createdAt: number;
  pendingRequest: { id: string; path: string; body: string | null } | null;
}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const memStore = new Map<string, Pair>();

export async function kvGet(code: string): Promise<Pair | null> {
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(`stud:pair:${code}`)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result: string | null };
      if (!data.result) return null;
      return JSON.parse(data.result) as Pair;
    } catch {
      return memGet(code);
    }
  }
  return memGet(code);
}

export async function kvSet(code: string, pair: Pair, ttlSeconds = 1800): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/set/${encodeURIComponent(`stud:pair:${code}`)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: JSON.stringify(pair),
          ex: ttlSeconds,
        }),
      });
      return;
    } catch {
      memSet(code, pair);
      return;
    }
  }
  memSet(code, pair);
}

export async function kvDel(code: string): Promise<void> {
  if (KV_URL && KV_TOKEN) {
    try {
      await fetch(`${KV_URL}/del/${encodeURIComponent(`stud:pair:${code}`)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
      });
      return;
    } catch {
      memDel(code);
      return;
    }
  }
  memDel(code);
}

function memGet(code: string): Pair | null {
  return memStore.get(code) ?? null;
}

function memSet(code: string, pair: Pair): void {
  memStore.set(code, pair);
}

function memDel(code: string): void {
  memStore.delete(code);
}