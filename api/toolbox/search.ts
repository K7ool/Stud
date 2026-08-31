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
  score?: number;
}

const CATEGORY_TO_ASSET_TYPE: Record<string, number> = {
  Model: 10,
  Decal: 13,
  Audio: 3,
  Plugin: 38,
  MeshPart: 40,
  Image: 1,
  Mesh: 40,
};

const SEMANTIC_KEYWORDS: Record<string, string[]> = {
  sword: ["sword", "blade", "melee", "katana", "weapon", "r15 sword"],
  gun: ["gun", "firearm", "pistol", "rifle", "weapon", "blaster", "fps weapon"],
  car: ["car", "vehicle", "automobile", "drivable car", "chassis"],
  npc: ["npc", "enemy", "character", "ai npc", "rig", "boss"],
  ui: ["gui", "hud", "ui", "menu", "inventory ui", "shop gui"],
  tree: ["tree", "nature", "foliage", "forest", "low poly tree"],
  house: ["house", "building", "structure", "mansion", "cabin"],
  door: ["door", "animated door", "interactable door", "sliding door"],
  pet: ["pet", "companion", "follower", "cute pet", "egg pet"],
  armor: ["armor", "shield", "helmet", "equipment", "suit"],
  magic: ["magic", "spell", "vfx", "particle", "magical"],
};

function expandQuery(query: string): string[] {
  const qLower = query.toLowerCase().trim();
  const variants = new Set<string>([query]);

  for (const [key, synonyms] of Object.entries(SEMANTIC_KEYWORDS)) {
    if (qLower.includes(key)) {
      for (const syn of synonyms) {
        variants.add(qLower.replace(key, syn));
        variants.add(syn);
      }
    }
  }

  return Array.from(variants).slice(0, 4);
}

async function searchCreatorStoreSingle(
  keyword: string,
  category: string,
  limit: number,
): Promise<{ results: RobloxSearchResult[]; failed: boolean }> {
  const assetType = CATEGORY_TO_ASSET_TYPE[category] ?? 10;
  const url = new URL("https://catalog.roblox.com/v1/search/items");
  url.searchParams.set("Category", "1");
  url.searchParams.set("Keyword", keyword);
  url.searchParams.set("AssetType", String(assetType));
  url.searchParams.set("SortType", "0");
  url.searchParams.set("SortAggregation", "3");
  url.searchParams.set("SortOrder", "2");
  url.searchParams.set("IncludeNotForSale", "false");
  url.searchParams.set("Limit", String(Math.min(limit, 30)));

  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    const res = await fetch(url.toString(), { headers: ROBLOX_HEADERS });
    lastStatus = res.status;
    if (res.status === 429) {
      lastError = "Rate limited by Roblox";
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${body.slice(0, 100)}`;
      if (res.status < 500) break;
      continue;
    }
    const json = (await res.json()) as {
      data?: Array<{ id: number; itemType: string }>;
    };
    const items = json.data ?? [];
    if (items.length === 0) return { results: [], failed: false };
    const ids = items.map((it) => it.id);
    const [detailsMap, thumbnailMap] = await Promise.all([
      fetchAssetDetailsBatch(ids),
      fetchThumbnailsBatch(ids),
    ]);
    const results: RobloxSearchResult[] = ids
      .map((id) => {
        const details = detailsMap[id];
        if (!details) return null;
        return {
          id,
          name: details.name,
          thumbnailUrl: thumbnailMap[id],
          creatorName: details.creatorName,
          creatorId: details.creatorId,
          price: details.price,
          assetType: category,
        };
      })
      .filter(Boolean) as RobloxSearchResult[];
    return { results, failed: false };
  }
  console.error(`[toolbox-search] catalog search failed after retries: ${lastError} (status ${lastStatus})`);
  return { results: [], failed: true };
}

async function searchCreatorStoreDeep(
  keyword: string,
  category: string,
  limit: number,
): Promise<{ results: RobloxSearchResult[]; failed: boolean }> {
  const queryVariants = expandQuery(keyword);
  const searchPromises = queryVariants.map((v) => searchCreatorStoreSingle(v, category, Math.min(limit, 20)));
  const searchOutcomes = await Promise.allSettled(searchPromises);

  const seenIds = new Set<number>();
  const combinedResults: RobloxSearchResult[] = [];
  let anySuccess = false;

  for (const outcome of searchOutcomes) {
    if (outcome.status === "fulfilled" && !outcome.value.failed) {
      anySuccess = true;
      for (const res of outcome.value.results) {
        if (!seenIds.has(res.id)) {
          seenIds.add(res.id);
          // Calculate simple keyword relevance score
          const lowerName = res.name.toLowerCase();
          const lowerKw = keyword.toLowerCase();
          let score = 0;
          if (lowerName.includes(lowerKw)) score += 10;
          if (res.creatorName === "Roblox") score += 5;
          if (res.thumbnailUrl) score += 3;
          res.score = score;
          combinedResults.push(res);
        }
      }
    }
  }

  // Sort by score descending
  combinedResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return { results: combinedResults.slice(0, limit), failed: !anySuccess && combinedResults.length === 0 };
}

async function fetchAssetDetailsBatch(
  ids: number[]
): Promise<Record<number, { name: string; creatorName: string; creatorId: number; price: number | null }>> {
  const results: Record<number, { name: string; creatorName: string; creatorId: number; price: number | null }> = {};
  for (const batch of chunk(ids, 10)) {
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(`https://economy.roblox.com/v2/assets/${id}/details`, {
            headers: ROBLOX_HEADERS,
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            Name?: string;
            Creator?: { Name?: string; Id?: number };
            PriceInRobux?: number | null;
          };
          results[id] = {
            name: data.Name ?? `Asset ${id}`,
            creatorName: data.Creator?.Name ?? "Unknown",
            creatorId: data.Creator?.Id ?? 0,
            price: data.PriceInRobux ?? null,
          };
        } catch {
          results[id] = { name: `Asset ${id}`, creatorName: "Unknown", creatorId: 0, price: null };
        }
      })
    );
  }
  return results;
}

async function fetchThumbnailsBatch(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  const url = new URL("https://thumbnails.roblox.com/v1/assets");
  url.searchParams.set("assetIds", ids.join(","));
  url.searchParams.set("size", "150x150");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");
  try {
    const res = await fetch(url.toString(), { headers: ROBLOX_HEADERS });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      data?: Array<{ targetId: number; imageUrl?: string; state: string }>;
    };
    const out: Record<number, string> = {};
    for (const item of data.data ?? []) {
      if (item.state === "Completed" && item.imageUrl) {
        out[item.targetId] = item.imageUrl;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function getThumbnails(assetIds: number[]): Promise<Record<number, string>> {
  if (assetIds.length === 0) return {};
  try {
    const url = new URL("https://thumbnails.roblox.com/v1/assets");
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
  const deep = url.searchParams.get("deep") === "true";

  if (!q) {
    return cors(new Response(JSON.stringify({ results: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  const category = CATEGORY_TO_CREATOR_STORE[type] ?? "Models";
  const cacheKey = `stud:toolbox:${type}:${q.toLowerCase()}:${limit}:${deep ? "deep" : "standard"}`;

  // Check cache
  const cached = (await kvGet(cacheKey)) as RobloxSearchResult[] | null;
  if (cached && cached.length > 0) {
    return cors(new Response(JSON.stringify({ results: cached, cached: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
  }

  // Fetch using deep multi-variant search when requested or default single search
  let results: RobloxSearchResult[] = [];
  let failed = false;
  try {
    const searchResult = deep
      ? await searchCreatorStoreDeep(q, category, limit)
      : await searchCreatorStoreSingle(q, category, limit);
    results = searchResult.results;
    failed = searchResult.failed;

    // If standard search returned 0 results, retry with deep search before falling back
    if (!failed && results.length === 0 && !deep) {
      const deepResult = await searchCreatorStoreDeep(q, category, limit);
      results = deepResult.results;
      failed = deepResult.failed;
    }
  } catch (e) {
    console.warn(`[toolbox-search] search error:`, e);
    failed = true;
  }

  if (failed || results.length === 0) {
    // Graceful fallback to pre-curated popular assets matching query tokens
    try {
      const { POPULAR_ASSETS } = await import("../../src/lib/toolbox/popular-assets");
      const lower = q.toLowerCase();
      const tokens = lower.split(/\s+/).filter(Boolean);
      const matched = POPULAR_ASSETS.filter((a) => {
        const catMatch = a.category.toLowerCase() === type.toLowerCase() || type === "Model";
        if (!catMatch) return false;
        const text = `${a.name} ${a.description} ${a.creator}`.toLowerCase();
        return tokens.some((t) => text.includes(t)) || text.includes(lower);
      });
      if (matched.length > 0) {
        results = matched.map((m) => ({
          id: m.id,
          name: m.name,
          creatorName: m.creator,
          creatorId: 1,
          price: 0,
          assetType: m.category,
        }));
      }
    } catch {
      // ignore
    }
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