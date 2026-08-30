/**
 * Client-side cache for Roblox Studio instance data.
 * Reduces round-trips for repeated reads (children, scripts, properties).
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5000; // 5 seconds for instance data
const SCRIPT_TTL_MS = 30_000; // 30 seconds for script content

export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs?: number): void {
  cache.set(key, { data, expires: Date.now() + (ttlMs ?? DEFAULT_TTL_MS) });
}

export function cacheInvalidate(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

export function cacheKey(endpoint: string, params?: Record<string, unknown>): string {
  return `${endpoint}:${params ? JSON.stringify(params) : ""}`;
}

export function withCache<T>(
  key: string,
  fetch: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== null) return Promise.resolve(cached);
  return fetch().then((data) => {
    cacheSet(key, data, ttlMs);
    return data;
  });
}
