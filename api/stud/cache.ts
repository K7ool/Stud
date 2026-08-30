/**
 * Shared in-memory + Edge-cache helpers for the stateless stud relay.
 *
 * Uses Vercel Edge `caches.default` (a Cache API) which is shared across
 * Edge function instances in the same region. This gives us ~30s of shared
 * state without needing Vercel KV.
 *
 * Falls back to per-instance memory when cache is unavailable (local dev).
 */

export const config = { runtime: "edge" };

const CACHE_VERSION = "v1";
const memCache = new Map<string, { value: unknown; expiresAt: number }>();

// Vercel Edge extends CacheStorage with a `default` property pointing at a
// shared cross-instance cache. Plain DOM lib.dom.d.ts doesn't know about it.
type EdgeCacheStorage = CacheStorage & { default?: Cache };
const edgeCaches = (typeof caches !== "undefined" ? caches : undefined) as EdgeCacheStorage | undefined;

async function cacheGet<T>(key: string): Promise<T | null> {
  const cacheKey = `stud:${CACHE_VERSION}:${key}`;
  try {
    if (edgeCaches?.default) {
      const res = await edgeCaches.default.match(`https://cache.local/${cacheKey}`);
      if (res) {
        const data = (await res.json()) as { v: T; e: number };
        if (data.e > Date.now()) return data.v;
      }
    }
  } catch {}
  const mem = memCache.get(cacheKey);
  if (mem && mem.expiresAt > Date.now()) return mem.value as T;
  return null;
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const cacheKey = `stud:${CACHE_VERSION}:${key}`;
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = JSON.stringify({ v: value, e: expiresAt });
  try {
    if (edgeCaches?.default) {
      const res = new Response(payload, {
        headers: { "Cache-Control": `public, max-age=${ttlSeconds}` },
      });
      await edgeCaches.default.put(`https://cache.local/${cacheKey}`, res);
    }
  } catch {}
  memCache.set(cacheKey, { value, expiresAt });
}

async function cacheDel(key: string): Promise<void> {
  const cacheKey = `stud:${CACHE_VERSION}:${key}`;
  try {
    if (edgeCaches?.default) {
      await edgeCaches.default.delete(`https://cache.local/${cacheKey}`);
    }
  } catch {}
  memCache.delete(cacheKey);
}

export async function getPendingCommand(siteId: string): Promise<{ id: string; path: string; body: string | null } | null> {
  return cacheGet<{ id: string; path: string; body: string | null }>(`cmd:${siteId}`);
}

export async function setPendingCommand(siteId: string, cmd: { id: string; path: string; body: string | null }): Promise<void> {
  await cacheSet(`cmd:${siteId}`, cmd, 30);
}

export async function getResult(siteId: string, id: string): Promise<{ status: number; body: string | null } | null> {
  return cacheGet<{ status: number; body: string | null }>(`res:${siteId}:${id}`);
}

export async function setResult(siteId: string, id: string, result: { status: number; body: string | null }): Promise<void> {
  await cacheSet(`res:${siteId}:${id}`, result, 60);
}