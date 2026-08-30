import { Check, X, AlertCircle, Box } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolboxInsertResult {
  success: boolean;
  verified?: boolean;
  assetId: number;
  assetName: string;
  creator?: string;
  thumbnailUrl?: string;
  path?: string;
  foundPath?: string;
  parent?: string;
  message?: string;
  error?: string;
}

interface ToolboxAssetCardProps {
  result: ToolboxInsertResult;
  className?: string;
}

export function ToolboxAssetCard({ result, className }: ToolboxAssetCardProps) {
  if (result.error) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex gap-3",
          className
        )}
      >
        <div className="shrink-0 mt-0.5">
          <X className="w-5 h-5 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Insertion failed
          </p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-1 break-words">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 flex gap-3",
          className
        )}
      >
        <div className="shrink-0 mt-0.5">
          <AlertCircle className="w-5 h-5 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700">Insertion failed</p>
          <p className="text-xs text-red-600 dark:text-red-500 mt-1">
            {result.message ?? "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 overflow-hidden",
        className
      )}
    >
      <div className="flex gap-0">
        {/* Thumbnail */}
        <div className="w-20 h-20 shrink-0 bg-muted relative">
          {result.thumbnailUrl ? (
            <img
              src={result.thumbnailUrl}
              alt={result.assetName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Box className="w-8 h-8 text-muted-foreground/50" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 px-3 py-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-900 dark:text-green-300 leading-tight truncate">
                {result.assetName}
              </p>
              {result.creator && (
                <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
                  by {result.creator}
                </p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {result.verified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded-full">
                  Sent
                </span>
              )}
            </div>
          </div>

          {result.path && (
            <p className="text-xs text-green-800 dark:text-green-600 mt-1.5 font-mono truncate">
              {result.foundPath ?? result.path}
            </p>
          )}

          {result.message && (
            <p className="text-xs text-green-700 dark:text-green-500 mt-1 leading-snug">
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
