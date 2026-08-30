/**
 * GET /api/toolbox/search?q=tree&type=Model&limit=24
 *
 * Proxies Roblox's Catalog API to bypass browser CORS. Results are cached
 * in Upstash for 5 minutes to avoid hitting Roblox's rate limits.
 *
 * Supported types:
 *   - Model: search Marketplace → creator-uploaded models
 *   - Decal: images
 *   - Audio: sounds
 *   - MeshPart / Mesh: meshes
 *   - Image: classic thumbnails
 *
 * Returns normalized results:
 *   { id, name, type, thumbnailUrl, creatorName, creatorId, price, assetType }
 */

export const config = { runtime: "edge" };

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CACHE_TTL = 5 * 60; // 5 minutes

const ROBLOX_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Stud)",
  Accept: "application/json",
};

const CATEGORY_TO_CREATOR_STORE: Record<string, string> = {
  Model: "Models",
  Decal: "Decals",
  Audio: "Audio",
  MeshPart: "Meshes",
  Mesh: "Meshes",
  Image: "Images",
  Plugin: "Plugins",
};

async function kvGet(key: string): Promise<unknown | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result: string | null };
  if (!data.result) return null;
  try {
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: unknown, ttl: number): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value), ex: ttl }),
  });
}

interface RobloxSearchResult {
  id: number;
  name: string;
  thumbnailUrl?: string;
  creatorName?: string;
  creatorId?: number;
  price?: number | null;
  assetType?: string;
}

async function searchCreatorStore(
  keyword: string,
  category: string,
  limit: number,
): Promise<RobloxSearchResult[]> {
  const url = new URL("https://apis.roblox.com/toolbox-service/v1/marketplace/search");
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("category", category);
  url.searchParams.set("limit", String(Math.min(limit, 30)));

  const res = await fetch(url.toString(), { headers: ROBLOX_HEADERS });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      id: number;
      name: string;
      thumbnail?: { url?: string };
      creator?: { name?: string; id?: number };
      price?: number | null;
      assetType?: { name?: string };
    }>;
  };
  const items = json.data ?? [];
  return items.map((it) => ({
    id: it.id,
    name: it.name,
    thumbnailUrl: it.thumbnail?.url,
    creatorName: it.creator?.name,
    creatorId: it.creator?.id,
    price: it.price ?? null,
    assetType: it.assetType?.name,
  }));
}

async function getThumbnails(assetIds: number[]): Promise<Record<number, string>> {
  if (assetIds.length === 0) return {};
  try {
    const url = new URL("https://thumbnails.roblox.com/v1/batch");
    url.searchParams.set("assetIds", assetIds.join(","));
    url.searchParams.set("size", "150x150");
    url.searchParams.set("format", "Png");
    url.searchParams.set("isCircular", "false");
    const res = await fetch(url.toString(), { headers: ROBLOX_HEADERS });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      data?: Array<{ targetId: number; imageUrl?: string }>;
    };
    const out: Record<number, string> = {};
    for (const item of json.data ?? []) {
      if (item.imageUrl) out[item.targetId] = item.imageUrl;
    }
    return out;
  } catch {
    return {};
  }
}

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") ?? "Model";
  const limit = parseInt(url.searchParams.get("limit") ?? "24", 10);

  if (!q) {
    return cors(new Response(JSON.stringify({ results: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  const category = CATEGORY_TO_CREATOR_STORE[type] ?? "Models";
  const cacheKey = `stud:toolbox:${type}:${q.toLowerCase()}:${limit}`;

  // Check cache
  const cached = (await kvGet(cacheKey)) as RobloxSearchResult[] | null;
  if (cached && cached.length > 0) {
    return cors(new Response(JSON.stringify({ results: cached, cached: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  // Fetch
  let results: RobloxSearchResult[] = [];
  try {
    results = await searchCreatorStore(q, category, limit);
  } catch (e) {
    return cors(new Response(JSON.stringify({ error: `Search failed: ${e}` }), {
      status: 502, headers: { "Content-Type": "application/json" },
    }));
  }

  // Backfill thumbnails if missing
  const needThumbs = results.filter((r) => !r.thumbnailUrl).map((r) => r.id);
  if (needThumbs.length > 0) {
    const thumbs = await getThumbnails(needThumbs);
    results = results.map((r) =>
      r.thumbnailUrl ? r : { ...r, thumbnailUrl: thumbs[r.id] },
    );
  }

  // Cache
  if (results.length > 0) {
    await kvSet(cacheKey, results, CACHE_TTL);
  }

  return cors(new Response(JSON.stringify({ results, cached: false }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
}