import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ToolCalls } from "./tool-call";
import type { ToolCall } from "@/stores/chat";

interface ToolActivityGroupProps {
  toolCalls: Array<ToolCall & { id: string }>;
  groupTitle?: string;
  className?: string;
}

export function ToolActivityGroup({
  toolCalls,
  groupTitle = "Tool Activity",
  className,
}: ToolActivityGroupProps) {
  // Early return BEFORE any hooks
  if (!toolCalls || toolCalls.length === 0) return null;

  const [isExpanded, setIsExpanded] = useState(false);

  // Count by status
  const completed = toolCalls.filter((tc) => tc.status === "complete").length;
  const errors = toolCalls.filter((tc) => tc.status === "error").length;
  const running = toolCalls.filter((tc) => tc.status === "running").length;

  return (
    <div className={cn("rounded-lg border bg-muted/30 overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {groupTitle}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completed} complete
            {errors > 0 && ` • ${errors} error${errors === 1 ? "" : "s"}`}
            {running > 0 && ` • ${running} running`}
          </p>
        </div>

        <span className="text-xs font-medium text-muted-foreground shrink-0">
          {toolCalls.length} calls
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t space-y-2 bg-background/50">
          <ToolCalls toolCalls={toolCalls} />
        </div>
      )}
    </div>
  );
}
