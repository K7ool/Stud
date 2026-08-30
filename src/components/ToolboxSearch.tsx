/**
 * ToolboxSearch — Creator Store asset picker panel.
 *
 * Slides out from the right side when the user clicks the Toolbox icon.
 * Search input + asset-type tabs → thumbnail grid → click to insert into Studio.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Input } from "@/components/ui/input";
import { Search, X, Box, Image as ImageIcon, Music, Layers, Sparkles } from "lucide-react";
import { searchToolbox, ASSET_TYPES } from "@/lib/toolbox/client";
import { studioRequest } from "@/lib/roblox/client";
import type { AssetType, ToolboxAsset } from "@/lib/toolbox/types";
import { cn } from "@/lib/utils";

const ICON_FOR_TYPE: Record<AssetType, typeof Box> = {
  Model: Box,
  Decal: ImageIcon,
  Audio: Music,
  MeshPart: Layers,
  Mesh: Layers,
  Image: ImageIcon,
  Plugin: Sparkles,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInserted?: (asset: ToolboxAsset) => void;
}

export function ToolboxSearch({ open, onOpenChange, onInserted }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<AssetType>("Model");
  const [results, setResults] = useState<ToolboxAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserting, setInserting] = useState<number | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await searchToolbox(query, type);
      if (controller.signal.aborted) return;
      if (res.error) setError(res.error);
      setResults(res.results);
      setLoading(false);
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, type]);

  const handleInsert = async (asset: ToolboxAsset) => {
    setInserting(asset.id);
    try {
      const res = await studioRequest<{ id: number; name: string }>("/asset/insert", {
        assetId: asset.id,
      });
      if (!res.success) {
        setError(res.error);
      } else if (onInserted) {
        onInserted(asset);
      }
    } finally {
      setInserting(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="font-medium">Toolbox</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets..."
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {ASSET_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors",
                type === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg mb-3">
            {error}
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader variant="circular" />
            <p className="mt-3 text-sm">Searching {ASSET_TYPES.find((t) => t.value === type)?.label}...</p>
          </div>
        )}

        {!loading && query && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No results</p>
          </div>
        )}

        {!query && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
            <Sparkles className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm font-medium mb-1">Find assets for your game</p>
            <p className="text-xs opacity-75">
              Search the Roblox Creator Store. Click any asset to insert it into your place.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {results.map((asset) => {
            const Icon = ICON_FOR_TYPE[asset.type] ?? Box;
            return (
              <button
                key={asset.id}
                onClick={() => handleInsert(asset)}
                disabled={inserting !== null}
                className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  )}
                  {inserting === asset.id && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <Loader variant="circular" />
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-0.5">
                  <p className="text-xs font-medium line-clamp-2 leading-tight">{asset.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {asset.creatorName ?? "Roblox"}
                    {asset.price ? ` · R$ ${asset.price}` : asset.price === 0 ? " · Free" : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {loading && results.length > 0 && (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Loader variant="dots" />
          </div>
        )}
      </div>
    </div>
  );
}