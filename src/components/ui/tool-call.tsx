import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader } from "./loader";
import { ChevronDown, ChevronRight, Check, X, Wrench, HelpCircle } from "lucide-react";
import { ToolboxAssetCard, type ToolboxInsertResult } from "@/components/chat/ToolboxAssetCard";
import { TaskResultCard } from "./task-result-card";

export interface ExecutionIssue {
  stepId?: string;
  message: string;
  reason?: string;
  retryable?: boolean;
  target?: string;
}

export interface ExecutionResult {
  taskId?: string;
  status: "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";
  title: string;
  summary: string;
  progress?: {
    completed: number;
    total: number;
  };
  changes?: string[];
  verification?: string[];
  issues?: ExecutionIssue[];
  nextAction?: string;
  toolCallCount?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error" | "waiting";
  error?: string;
  duration?: number;
  requestId?: string;
  executionResult?: ExecutionResult;
}

export interface ToolCallProps {
  name: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: "pending" | "running" | "complete" | "error" | "waiting";
  error?: string;
  duration?: number;
  className?: string;
  executionResult?: ExecutionResult;
}

// Pretty print tool name (e.g., roblox_get_script -> Get Script)
function formatToolName(name: string): string {
  return name
    .replace(/^roblox_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Format duration in milliseconds
function formatDuration(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

export function ToolCall({
  name,
  input,
  output,
  status,
  error,
  duration,
  className,
  executionResult,
}: ToolCallProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const statusConfig = {
    pending: {
      icon: <Loader variant="circular" size="sm" />,
      label: "Waiting...",
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
    },
    running: {
      icon: <Loader variant="circular" size="sm" />,
      label: "Running...",
      color: "text-primary",
      bgColor: "bg-primary/5",
    },
    waiting: {
      icon: <HelpCircle className="w-4 h-4" />,
      label: "Waiting for response...",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10 border-amber-500/20",
    },
    complete: {
      icon: <Check className="w-4 h-4" />,
      label: "Complete",
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10 border-emerald-500/20",
    },
    error: {
      icon: <X className="w-4 h-4" />,
      label: "Error",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10 border-red-500/20",
    },
  };

  const { icon, color, bgColor } = statusConfig[status];

  return (
    <div
      className={cn(
        "rounded-xl border transition-all",
        bgColor,
        className
      )}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-75 transition-opacity"
      >
        {/* Expand/collapse icon */}
        <span className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>

        {/* Tool icon */}
        <span className={cn("flex-shrink-0", color)}>
          <Wrench className="w-4 h-4" />
        </span>

        {/* Tool name and duration (compact view) */}
        <span className="font-medium text-sm flex-1 min-w-0">
          <span className="truncate">{formatToolName(name)}</span>
          {duration && !isExpanded && (
            <span className="text-xs text-muted-foreground ml-2">
              · {formatDuration(duration)}
            </span>
          )}
        </span>

        {/* Status indicator */}
        <span className={cn("flex items-center gap-1.5 flex-shrink-0", color)}>
          {icon}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t">
          {/* Duration in expanded view */}
          {duration && (
            <div className="text-xs text-muted-foreground">
              Duration: {formatDuration(duration)}
            </div>
          )}

          {/* Task Result - show when executionResult exists */}
          {executionResult && (
            <div className="mb-4">
              <TaskResultCard
                result={executionResult}
                toolCallCount={executionResult.toolCallCount}
              />
            </div>
          )}

          {/* Rich card for toolbox insertion results */}
          {status === "complete" &&
           name === "roblox_insert_asset" &&
           output != null &&
           typeof output === "object" &&
           (output as Record<string, unknown>).success !== undefined && (
             <ToolboxAssetCard result={output as ToolboxInsertResult} />
           )}

          {/* Input */}
          {input && Object.keys(input).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Input
              </p>
              <pre className="text-xs bg-background/80 rounded-lg p-3 overflow-x-auto border max-h-48 overflow-y-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {status === "complete" && output !== undefined && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Output
              </p>
              <pre className="text-xs bg-background/80 rounded-lg p-3 overflow-x-auto border max-h-48 overflow-y-auto">
                {typeof output === "string" 
                  ? output 
                  : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {status === "error" && error && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                Error
              </p>
              <pre className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg p-3 overflow-x-auto border border-red-500/20 max-h-48 overflow-y-auto">
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface ToolCallsProps {
  toolCalls: ToolCall[];
  className?: string;
}

export function ToolCalls({ toolCalls, className }: ToolCallsProps) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {toolCalls.map((tc) => (
        <ToolCall
          key={tc.id}
          name={tc.name}
          input={tc.args}
          output={tc.result}
          status={tc.status}
          error={tc.error}
          duration={tc.duration}
          executionResult={tc.executionResult}
        />
      ))}
    </div>
  );
}
