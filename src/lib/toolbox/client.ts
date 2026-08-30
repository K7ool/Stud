import type { AssetType, ToolboxSearchResponse } from "./types";

export async function searchToolbox(
  q: string,
  type: AssetType = "Model",
  limit = 24,
): Promise<ToolboxSearchResponse> {
  if (!q.trim()) return { results: [] };
  const url = `/api/toolbox/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { results: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as ToolboxSearchResponse;
    if (data.error) return data;
    return { results: data.results, cached: data.cached };
  } catch (e) {
    return { results: [], error: `${e}` };
  }
}

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "Model", label: "Models" },
  { value: "Decal", label: "Decals" },
  { value: "Audio", label: "Audio" },
  { value: "MeshPart", label: "Meshes" },
  { value: "Image", label: "Images" },
];