export type AssetType =
  | "Model"
  | "Decal"
  | "Audio"
  | "MeshPart"
  | "Mesh"
  | "Image"
  | "Plugin";

export interface ToolboxAsset {
  id: number;
  name: string;
  type: AssetType;
  thumbnailUrl?: string;
  creatorName?: string;
  creatorId?: number;
  price?: number | null;
  assetType?: string;
}

export interface ToolboxSearchResponse {
  results: ToolboxAsset[];
  cached?: boolean;
  error?: string;
}