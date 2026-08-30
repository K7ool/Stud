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
}

export type AssetCategory = "Model" | "Decal" | "Audio" | "Plugin" | "MeshPart";

// ---------------------------------------------------------------------------
// Web mode: uses the edge proxy (/api/toolbox/search)
// ---------------------------------------------------------------------------
async function webSearchToolbox(
  query: string,
  category: AssetCategory,
  limit: number
): Promise<ToolboxSearchResult> {
  const url = `/api/toolbox/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(category)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return { assets: [] };
  const data = (await res.json()) as {
    results: Array<{
      id: number;
      name: string;
      thumbnailUrl?: string;
      creatorName?: string;
      creatorId?: number;
      price?: number | null;
      assetType?: string;
    }>;
  };
  const assets: ToolboxAsset[] = (data.results ?? []).map((r) => ({
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
}

async function webGetAssetDetails(assetId: number): Promise<ToolboxAsset | null> {
  const res = await fetch(`/api/toolbox/assets/${assetId}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { asset?: ToolboxAsset; error?: string };
  return data.asset ?? null;
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

const CATALOG_DETAILS_API = "https://catalog.roblox.com/v1/search/items/details";
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
  const assetType = CATEGORY_TO_TYPE[category];
  const params = new URLSearchParams({
    Category: "1",
    Keyword: query,
    AssetType: assetType.toString(),
    Limit: limit.toString(),
    SortType: "0",
    SortAggregation: "3",
    SortOrder: "2",
    IncludeNotForSale: "false",
  });

  const response = await fn(`${CATALOG_DETAILS_API}?${params}`, {
    method: "GET",
    headers: { "User-Agent": "Stud/1.0", Accept: "application/json" },
  });

  if (!response.ok) {
    return tauriSearchFallback(query, category, limit, fn);
  }

  const rawData = await response.json();
  const data = rawData as {
    data?: Array<{
      id: number;
      name?: string;
      description?: string;
      creatorName?: string;
      creatorTargetId?: number;
      favoriteCount?: number;
    }>;
    nextPageCursor?: string;
  };

  if (!data.data || !Array.isArray(data.data)) {
    return tauriSearchFallback(query, category, limit, fn);
  }

  const assets: ToolboxAsset[] = data.data.map((item) => ({
    id: item.id,
    name: item.name ?? `Asset ${item.id}`,
    description: item.description ?? "",
    creatorName: item.creatorName ?? "Unknown",
    creatorId: item.creatorTargetId ?? 0,
    favoriteCount: item.favoriteCount ?? 0,
    created: "",
    updated: "",
  }));

  if (assets.length > 0) {
    const thumbs = await tauriFetchThumbnails(assets.map((a) => a.id), fn);
    assets.forEach((a) => {
      a.thumbnailUrl = thumbs[a.id];
    });
  }

  return { assets, nextPageCursor: data.nextPageCursor };
}

async function tauriSearchFallback(
  query: string,
  category: AssetCategory,
  limit: number,
  fn: FetchFn
): Promise<ToolboxSearchResult> {
  const assetType = CATEGORY_TO_TYPE[category];
  const params = new URLSearchParams({
    keyword: query,
    assetType: assetType.toString(),
    limit: limit.toString(),
    sortType: "Relevance",
    sortOrder: "Desc",
  });

  const response = await fn(`${CATALOG_SEARCH_API}?${params}`, {
    method: "GET",
    headers: { "User-Agent": "Stud/1.0" },
  });
  if (!response.ok) return { assets: [] };

  const rawData = await response.json();
  const data = rawData as { data?: Array<{ id: number }> };
  if (!data.data) return { assets: [] };

  const assets: ToolboxAsset[] = [];
  for (const item of data.data.slice(0, limit)) {
    const details = await tauriGetAssetDetails(item.id, fn);
    if (details) assets.push(details);
  }
  return { assets };
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
      `https://thumbnails.roblox.com/v1/batch?assetIds=${assetId}&size=150x150&format=Png&isCircular=false`,
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

export async function searchToolbox(
  query: string,
  category: AssetCategory = "Model",
  limit = 10
): Promise<ToolboxSearchResult> {
  if (isWebMode) {
    return webSearchToolbox(query, category, limit);
  }
  return tauriSearchToolbox(query, category, limit);
}

export async function getAssetDetails(
  assetId: number
): Promise<ToolboxAsset | null> {
  if (isWebMode) {
    return webGetAssetDetails(assetId);
  }
  return tauriGetAssetDetails(assetId, await getFetch());
}
