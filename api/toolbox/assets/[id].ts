/**
 * GET /api/toolbox/assets/[id]
 *
 * Returns full metadata for a single Roblox asset.
 * Used by the AI toolbox tools to get description, creator, stats.
 * Cached in Upstash for 10 minutes.
 */
export const config = { runtime: "edge" };

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CACHE_TTL = 10 * 60;

const ROBLOX_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Stud)",
  Accept: "application/json",
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

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

interface AssetDetails {
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

async function fetchFromRoblox(id: number): Promise<AssetDetails | null> {
  const [economyRes, thumbRes] = await Promise.allSettled([
    fetch(`https://economy.roblox.com/v2/assets/${id}/details`, {
      headers: ROBLOX_HEADERS,
    }),
    fetch(
      `https://thumbnails.roblox.com/v1/batch?assetIds=${id}&size=150x150&format=Png&isCircular=false`,
      { headers: ROBLOX_HEADERS }
    ),
  ]);

  let name = `Asset ${id}`;
  let description = "";
  let creatorName = "Unknown";
  let creatorId = 0;
  let favoriteCount = 0;
  let created = "";
  let updated = "";

  if (economyRes.status === "fulfilled" && economyRes.value.ok) {
    try {
      const eco = (await economyRes.value.json()) as {
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
      /* ignore parse errors */
    }
  }

  let thumbnailUrl: string | undefined;
  if (thumbRes.status === "fulfilled" && thumbRes.value.ok) {
    try {
      const thumb = (await thumbRes.value.json()) as {
        data?: Array<{ targetId: number; imageUrl?: string }>;
      };
      const entry = thumb.data?.find((d) => d.targetId === id);
      thumbnailUrl = entry?.imageUrl;
    } catch {
      /* ignore parse errors */
    }
  }

  return {
    id,
    name,
    description,
    creatorName,
    creatorId,
    thumbnailUrl,
    favoriteCount,
    created,
    updated,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

  const url = new URL(req.url);
  const pathnameParts = url.pathname.split("/");
  const idStr = pathnameParts[pathnameParts.length - 1];
  const id = parseInt(idStr, 10);

  if (!idStr || isNaN(id) || id <= 0) {
    return cors(
      new Response(JSON.stringify({ error: "Invalid asset ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  const cacheKey = `stud:toolbox:asset:${id}`;

  const cached = (await kvGet(cacheKey)) as AssetDetails | null;
  if (cached) {
    return cors(
      new Response(JSON.stringify({ asset: cached, cached: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  const asset = await fetchFromRoblox(id);
  if (!asset) {
    return cors(
      new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  await kvSet(cacheKey, asset, CACHE_TTL);

  return cors(
    new Response(JSON.stringify({ asset, cached: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}
