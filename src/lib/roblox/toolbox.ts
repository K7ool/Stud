/**
 * Roblox Toolbox API Client
 *
 * Unified client that works in both web mode (via edge proxy) and
 * Tauri/desktop mode (direct Roblox APIs).
 */

const isWebMode =
  typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

export interface ToolboxAsset {
  id: number;
  name: string;
  description: string;
  creatorName: string;
  creatorId: number;
  thumbnailUrl?: string;
  favoriteCount: number;
  created: string;
  updated: string;
}

export interface ToolboxSearchResult {
  assets: ToolboxAsset[];
  nextPageCursor?: string;
  error?: string;
}

export type AssetCategory = "Model" | "Decal" | "Audio" | "Plugin" | "MeshPart";

// ---------------------------------------------------------------------------
// Web mode: server proxy → browser direct → pre-curated popular assets
// ---------------------------------------------------------------------------

const CATEGORY_TO_ASSET_TYPE: Record<string, number> = {
  Model: 10,
  Decal: 13,
  Audio: 3,
  Plugin: 38,
  MeshPart: 40,
};

async function webSearchToolbox(
  query: string,
  category: AssetCategory,
  limit: number
): Promise<ToolboxSearchResult> {
  // Tier 1: Try server-side proxy (has caching, uses server IPs)
  const proxyResult = await webSearchViaProxy(query, category, limit);
  if (proxyResult.assets.length > 0) return proxyResult;

  // Tier 2: Try direct browser search (bypasses Vercel, uses user's IP)
  const directResult = await webSearchDirectBrowser(query, category, limit);
  if (directResult.assets.length > 0) return directResult;

  // Tier 3: Fall back to pre-curated popular assets
  const { searchPopularAssets, POPULAR_ASSETS } = await import("@/lib/toolbox/popular-assets");
  const popular = searchPopularAssets(query, category);
  const curated = popular.slice(0, Math.min(limit, 50));

  if (curated.length > 0) {
    const assets = curated.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      creatorName: a.creator,
      creatorId: 0,
      thumbnailUrl: undefined,
      favoriteCount: 0,
      created: "",
      updated: "",
    }));
    return {
      assets,
      error: "Live search unavailable — showing popular assets instead. You can still insert any of these.",
    };
  }

  return {
    assets: [],
    error: "Search unavailable. Try again later or use a different keyword.",
  };
}

async function webSearchViaProxy(
  query: string,
  category: AssetCategory,
  limit: number,
  deep = false,
): Promise<ToolboxSearchResult> {
  try {
    const url = `/api/toolbox/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(category)}&limit=${limit}${deep ? "&deep=true" : ""}`;
    const res = await fetch(url);
    if (!res.ok) return { assets: [] };
    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        thumbnailUrl?: string;
        creatorName?: string;
        creatorId?: number;
        price?: number | null;
        assetType?: string;
      }>;
      error?: string;
    };
    if (!data.results || data.results.length === 0) return { assets: [] };
    const assets: ToolboxAsset[] = data.results.map((r) => ({
      id: r.id,
      name: r.name,
      description: "",
      creatorName: r.creatorName ?? "Unknown",
      creatorId: r.creatorId ?? 0,
      thumbnailUrl: r.thumbnailUrl,
      favoriteCount: 0,
      created: "",
      updated: "",
    }));
    return { assets };
  } catch {
    return { assets: [] };
  }
}

async function webSearchDirectBrowser(
  query: string,
  category: AssetCategory,
  limit: number
): Promise<ToolboxSearchResult> {
  const assetType = CATEGORY_TO_ASSET_TYPE[category] ?? 10;
  const params = new URLSearchParams({
    Category: "1",
    Keyword: query,
    AssetType: String(assetType),
    SortType: "0",
    SortAggregation: "3",
    SortOrder: "2",
    IncludeNotForSale: "false",
    Limit: String(Math.min(limit, 30)),
  });

  try {
    const res = await fetch(`https://catalog.roblox.com/v1/search/items?${params}`, {
      credentials: "omit",
    });
    if (!res.ok) return { assets: [] };

    const json = (await res.json()) as {
      data?: Array<{ id: number; itemType: string }>;
    };
    const items = json.data ?? [];
    if (items.length === 0) return { assets: [] };

    const ids = items.map((it) => it.id);
    // Fetch thumbnails directly (this endpoint supports CORS)
    const thumbs = await fetchBrowserThumbnails(ids);
    // Fetch details via our server (since economy.roblox.com may not support browser CORS)
    const details = await webGetAssetDetailsBatch(ids);

    const assets: ToolboxAsset[] = ids
      .map((id) => {
        const d = details[id];
        if (!d) return null;
        return {
          id,
          name: d.name,
          description: "",
          creatorName: d.creatorName,
          creatorId: d.creatorId,
          thumbnailUrl: thumbs[id],
          favoriteCount: 0,
          created: "",
          updated: "",
        };
      })
      .filter(Boolean) as ToolboxAsset[];

    return { assets };
  } catch {
    return { assets: [] };
  }
}

async function fetchBrowserThumbnails(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  try {
    const params = new URLSearchParams({
      assetIds: ids.join(","),
      size: "150x150",
      format: "Png",
      isCircular: "false",
    });
    const res = await fetch(`https://thumbnails.roblox.com/v1/assets?${params}`, {
      credentials: "omit",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      data?: Array<{ targetId: number; imageUrl?: string; state: string }>;
    };
    const out: Record<number, string> = {};
    for (const item of data.data ?? []) {
      if (item.state === "Completed" && item.imageUrl) out[item.targetId] = item.imageUrl;
    }
    return out;
  } catch {
    return {};
  }
}

async function webGetAssetDetailsBatch(
  ids: number[]
): Promise<Record<number, { name: string; creatorName: string; creatorId: number }>> {
  // Use our server-side asset details endpoint (batch)
  if (ids.length === 0) return {};
  const results: Record<number, { name: string; creatorName: string; creatorId: number }> = {};
  // Run detail fetches in parallel instead of sequentially (N+1 → batch).
  // Bound concurrency to avoid hammering the endpoints.
  for (const batch of chunkArr(ids, 10)) {
    const fetched = await Promise.all(batch.map((id) => webGetAssetDetails(id)));
    batch.forEach((id, idx) => {
      const asset = fetched[idx];
      if (asset) results[id] = { name: asset.name, creatorName: asset.creatorName, creatorId: asset.creatorId };
    });
  }
  return results;
}

async function webGetAssetDetails(assetId: number): Promise<ToolboxAsset | null> {
  // Tier 1: server endpoint
  try {
    const res = await fetch(`/api/toolbox/assets/${assetId}`);
    if (res.ok) {
      const data = (await res.json()) as { asset?: ToolboxAsset };
      if (data.asset) return data.asset;
    }
  } catch {
    // fall through
  }
  // Tier 2: try economy API directly from browser
  try {
    const res = await fetch(`https://economy.roblox.com/v2/assets/${assetId}/details`, {
      credentials: "omit",
    });
    if (res.ok) {
      const eco = (await res.json()) as {
        Name?: string;
        Creator?: { Name?: string; Id?: number };
        FavoriteCount?: number;
      };
      if (eco.Name) {
        return {
          id: assetId,
          name: eco.Name,
          description: "",
          creatorName: eco.Creator?.Name ?? "Unknown",
          creatorId: eco.Creator?.Id ?? 0,
          favoriteCount: eco.FavoriteCount ?? 0,
          created: "",
          updated: "",
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tauri/desktop mode: direct Roblox API calls
// ---------------------------------------------------------------------------

type FetchFn = typeof fetch;
let _fetch: FetchFn | null = null;

async function getFetch(): Promise<FetchFn> {
  if (_fetch) return _fetch;
  if (isWebMode) {
    _fetch = fetch;
  } else {
    const mod = await import("@tauri-apps/plugin-http");
    _fetch = (mod.fetch as FetchFn).bind(globalThis);
  }
  return _fetch;
}

const CATALOG_SEARCH_API = "https://catalog.roblox.com/v1/search/items";
const THUMBNAILS_API = "https://thumbnails.roblox.com/v1/assets";

const CATEGORY_TO_TYPE: Record<AssetCategory, number> = {
  Model: 10,
  Decal: 13,
  Audio: 3,
  Plugin: 38,
  MeshPart: 40,
};

async function tauriSearchToolbox(
  query: string,
  category: AssetCategory,
  limit: number
): Promise<ToolboxSearchResult> {
  const fn = await getFetch();
  const assetType = CATEGORY_TO_TYPE[category] ?? 10;
  const params = new URLSearchParams({
    Category: "1",
    Keyword: query,
    AssetType: String(assetType),
    SortType: "0",
    SortAggregation: "3",
    SortOrder: "2",
    IncludeNotForSale: "false",
    Limit: String(Math.min(limit, 30)),
  });

  const response = await fn(`${CATALOG_SEARCH_API}?${params}`, {
    method: "GET",
    headers: { "User-Agent": "Stud/1.0", Accept: "application/json" },
  });

  if (!response.ok) {
    return { assets: [] };
  }

  const rawData = await response.json();
  const data = rawData as {
    data?: Array<{ id: number; itemType: string }>;
  };
  if (!data.data || !Array.isArray(data.data)) {
    return { assets: [] };
  }

  const ids = data.data.map((it) => it.id);
  if (ids.length === 0) return { assets: [] };

  const [detailsMap, thumbnailMap] = await Promise.all([
    tauriFetchDetailsBatch(ids, fn),
    tauriFetchThumbnails(ids, fn),
  ]);

  const assets: ToolboxAsset[] = ids
    .map((id) => {
      const d = detailsMap[id];
      if (!d) return null;
      return {
        id,
        name: d.name,
        description: "",
        creatorName: d.creatorName,
        creatorId: d.creatorId,
        favoriteCount: 0,
        created: "",
        updated: "",
        thumbnailUrl: thumbnailMap[id],
      };
    })
    .filter(Boolean) as ToolboxAsset[];

  return { assets };
}

async function tauriFetchDetailsBatch(
  ids: number[],
  fn: FetchFn
): Promise<Record<number, { name: string; creatorName: string; creatorId: number }>> {
  const results: Record<number, { name: string; creatorName: string; creatorId: number }> = {};
  for (const batch of chunkArr(ids, 10)) {
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fn(`https://economy.roblox.com/v2/assets/${id}/details`, {
            method: "GET",
            headers: { "User-Agent": "Stud/1.0" },
          });
          if (!res.ok) return;
          const eco = (await res.json()) as {
            Name?: string;
            Creator?: { Name?: string; Id?: number };
          };
          results[id] = {
            name: eco.Name ?? `Asset ${id}`,
            creatorName: eco.Creator?.Name ?? "Unknown",
            creatorId: eco.Creator?.Id ?? 0,
          };
        } catch {
          results[id] = { name: `Asset ${id}`, creatorName: "Unknown", creatorId: 0 };
        }
      })
    );
  }
  return results;
}

async function tauriFetchThumbnails(
  assetIds: number[],
  fn: FetchFn
): Promise<Record<number, string>> {
  if (assetIds.length === 0) return {};
  const params = new URLSearchParams({
    assetIds: assetIds.join(","),
    size: "150x150",
    format: "Png",
    isCircular: "false",
  });
  const response = await fn(`${THUMBNAILS_API}?${params}`, {
    method: "GET",
    headers: { "User-Agent": "Stud/1.0" },
  });
  if (!response.ok) return {};
  const data = (await response.json()) as {
    data: Array<{ targetId: number; imageUrl: string; state: string }>;
  };
  const out: Record<number, string> = {};
  data.data.forEach((item) => {
    if (item.state === "Completed" && item.imageUrl) out[item.targetId] = item.imageUrl;
  });
  return out;
}

function chunkArr<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function tauriGetAssetDetails(
  assetId: number,
  fn: FetchFn
): Promise<ToolboxAsset | null> {
  const [ecoRes, thumbRes] = await Promise.allSettled([
    fn(`https://economy.roblox.com/v2/assets/${assetId}/details`, {
      method: "GET",
      headers: { "User-Agent": "Stud/1.0" },
    }),
    fn(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=150x150&format=Png&isCircular=false`,
      { headers: { "User-Agent": "Stud/1.0" } }
    ),
  ]);

  let name = `Asset ${assetId}`;
  let description = "";
  let creatorName = "Unknown";
  let creatorId = 0;
  let favoriteCount = 0;
  let created = "";
  let updated = "";

  if (ecoRes.status === "fulfilled" && ecoRes.value.ok) {
    try {
      const eco = (await ecoRes.value.json()) as {
        Name?: string;
        Description?: string;
        Creator?: { Name?: string; Id?: number };
        Created?: string;
        Updated?: string;
        FavoriteCount?: number;
      };
      name = eco.Name ?? name;
      description = eco.Description ?? "";
      creatorName = eco.Creator?.Name ?? creatorName;
      creatorId = eco.Creator?.Id ?? creatorId;
      favoriteCount = eco.FavoriteCount ?? 0;
      created = eco.Created ?? "";
      updated = eco.Updated ?? "";
    } catch {
      /* ignore */
    }
  }

  let thumbnailUrl: string | undefined;
  if (thumbRes.status === "fulfilled" && thumbRes.value.ok) {
    try {
      const thumb = (await thumbRes.value.json()) as {
        data?: Array<{ targetId: number; imageUrl?: string }>;
      };
      thumbnailUrl = thumb.data?.find((d) => d.targetId === assetId)?.imageUrl;
    } catch {
      /* ignore */
    }
  }

  return { id: assetId, name, description, creatorName, creatorId, thumbnailUrl, favoriteCount, created, updated };
}

// ---------------------------------------------------------------------------
// Public API — dispatches to web or Tauri based on environment
// ---------------------------------------------------------------------------

// Simple in-memory TTL cache to avoid repeated network calls for identical
// queries/assets, plus in-flight dedup so concurrent identical calls share one
// request instead of firing duplicates.
const SEARCH_TTL = 5 * 60 * 1000;
const ASSET_TTL = 10 * 60 * 1000;
const searchCache = new Map<string, { at: number; value: ToolboxSearchResult }>();
const assetCache = new Map<number, { at: number; value: ToolboxAsset | null }>();
const inflightSearch = new Map<string, Promise<ToolboxSearchResult>>();
const inflightAsset = new Map<number, Promise<ToolboxAsset | null>>();

function pruneCache<T>(map: Map<string | number, { at: number; value: T }>, max = 200) {
  if (map.size > max) {
    const now = Date.now();
    for (const [k, v] of map) {
      if (now - v.at > SEARCH_TTL) map.delete(k);
    }
  }
}

export async function searchToolbox(
  query: string,
  category: AssetCategory = "Model",
  limit = 10,
  deep = false,
): Promise<ToolboxSearchResult> {
  const key = `${category}\u0000${query}\u0000${limit}\u0000${deep ? "deep" : "std"}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.value;

  const inflight = inflightSearch.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    const result = isWebMode
      ? await webSearchViaProxy(query, category, limit, deep).then((res) =>
          res.assets.length > 0 ? res : webSearchToolbox(query, category, limit)
        )
      : await tauriSearchToolbox(query, category, limit);
    searchCache.set(key, { at: Date.now(), value: result });
    pruneCache(searchCache);
    return result;
  })();
  inflightSearch.set(key, run);
  try {
    return await run;
  } finally {
    inflightSearch.delete(key);
  }
}

export async function deepSearchToolbox(
  query: string,
  category: AssetCategory = "Model",
  limit = 15,
): Promise<ToolboxSearchResult> {
  return searchToolbox(query, category, limit, true);
}

export async function getAssetDetails(
  assetId: number
): Promise<ToolboxAsset | null> {
  const hit = assetCache.get(assetId);
  if (hit && Date.now() - hit.at < ASSET_TTL) return hit.value;

  const inflight = inflightAsset.get(assetId);
  if (inflight) return inflight;

  const run = (async () => {
    const result = isWebMode
      ? await webGetAssetDetails(assetId)
      : await tauriGetAssetDetails(assetId, await getFetch());
    assetCache.set(assetId, { at: Date.now(), value: result });
    pruneCache(assetCache);
    return result;
  })();
  inflightAsset.set(assetId, run);
  try {
    return await run;
  } finally {
    inflightAsset.delete(assetId);
  }
}
