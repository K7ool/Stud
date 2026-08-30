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
// Web mode: uses the edge proxy (/api/toolbox/search)
// ---------------------------------------------------------------------------
async function webSearchToolbox(
  query: string,
  category: AssetCategory,
  limit: number
): Promise<ToolboxSearchResult> {
  const url = `/api/toolbox/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(category)}&limit=${limit}`;
  let errorMessage: string | undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string };
        if (errBody?.error) msg = errBody.error;
      } catch {
        /* ignore parse errors */
      }
      errorMessage = msg;
    }
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
    if (data.error && !errorMessage) errorMessage = data.error;
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
    if (errorMessage && assets.length === 0) {
      return { assets: [], error: errorMessage };
    }
    return { assets };
  } catch (e) {
    return { assets: [], error: `Network error: ${e}` };
  }
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
