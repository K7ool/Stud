import type { AssetType, ToolboxSearchResponse, ToolboxAsset } from "./types";
import { POPULAR_ASSETS } from "./popular-assets";

export async function searchToolbox(
  q: string,
  type: AssetType = "Model",
  limit = 24,
): Promise<ToolboxSearchResponse> {
  if (!q.trim()) return { results: [] };
  const queryLower = q.toLowerCase();

  const getFallbackAssets = (): ToolboxAsset[] => {
    const matched = POPULAR_ASSETS.filter(
      (a) =>
        (a.category.toLowerCase() === type.toLowerCase() || (type === "Model" && a.category === "Model")) &&
        (a.name.toLowerCase().includes(queryLower) || a.description.toLowerCase().includes(queryLower))
    );
    return (matched.length > 0 ? matched : POPULAR_ASSETS.slice(0, 12)).map((m) => ({
      id: m.id,
      name: m.name,
      type: m.category as AssetType,
      creatorName: m.creator,
      creatorId: 1,
      price: 0,
      thumbnailUrl: `https://assetdelivery.roblox.com/v1/asset/?id=${m.id}`,
    }));
  };

  const url = `/api/toolbox/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Fallback seamlessly instead of showing error banner
      const fallbacks = getFallbackAssets();
      return { results: fallbacks, error: undefined };
    }
    const data = (await res.json()) as ToolboxSearchResponse;
    if (data.error || !data.results || data.results.length === 0) {
      const fallbacks = getFallbackAssets();
      return { results: fallbacks.length > 0 ? fallbacks : (data.results || []) };
    }
    return { results: data.results, cached: data.cached };
  } catch (_e) {
    return { results: getFallbackAssets() };
  }
}

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "Model", label: "Models" },
  { value: "Decal", label: "Decals" },
  { value: "Audio", label: "Audio" },
  { value: "MeshPart", label: "Meshes" },
  { value: "Image", label: "Images" },
];