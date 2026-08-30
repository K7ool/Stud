import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader } from "./loader";
import { ChevronDown, ChevronRight, Check, X, Wrench, HelpCircle, AlertCircle, RotateCw, Plus } from "lucide-react";
import { Button } from "./button";
import { ExecutionStatusBadge } from "./execution-status-badge";
import { TaskResultCard } from "./task-result-card";
import type { ExecutionResult, ToolCall } from "@/stores/chat";

export interface TaskExecutionResultProps {
  result: ExecutionResult;
  toolCalls?: ToolCall[];
  onRetry?: () => void;
  onRetryStep?: (stepId: string) => void;
  onCreateTask?: (title: string, prompt: string) => void;
  className?: string;
}

function formatDuration(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function groupToolCalls(calls: ToolCall[]): ToolCall[][] {
  const groups: ToolCall[][] = [];
  let currentGroup: ToolCall[] = [];
  let groupType: "discover" | "action" | "other" = "other";

  for (const call of calls) {
    if (call.name.includes("discover") || call.name.includes("scan") || call.name.includes("get")) {
      if (groupType !== "discover") {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        groupType = "discover";
      }
    } else if (call.name.includes("edit") || call.name.includes("create") || call.name.includes("set")) {
      if (groupType !== "action") {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        groupType = "action";
      }
    } else {
      if (groupType !== "other") {
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [];
        groupType = "other";
      }
    }
    currentGroup.push(call);
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  return groups;
}

function getStatusIcon(status: ExecutionResult["status"]) {
  switch (status) {
    case "completed":
      return <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case "partial":
      return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case "failed":
      return <X className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case "blocked":
      return <Loader className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case "cancelled":
      return <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
    default:
      return <Loader className="w-4 h-4 animate-pulse" />;
  }
}

function getStatusText(status: ExecutionResult["status"]) {
  switch (status) {
    case "completed":
      return "✓ Completed";
    case "partial":
      return "⚠ Partially Completed";
    case "failed":
      return "✕ Failed";
    case "blocked":
      return "⏸ Blocked";
    case "cancelled":
      return "⏹ Cancelled";
    default:
      return "◐ In Progress";
  }
}

export function TaskExecutionResult({
  result,
  toolCalls = [],
  onRetry,
  onRetryStep,
  onCreateTask,
  className,
}: TaskExecutionResultProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary"])
  );
  const [isToolLogExpanded, setIsToolLogExpanded] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpandedSections(next);
  };

  const handleCreateTask = () => {
    if (taskTitle.trim() && onCreateTask) {
      onCreateTask(taskTitle.trim(), result.summary);
      setShowCreateTaskDialog(false);
      setTaskTitle("");
    }
  };

  const toolGroups = groupToolCalls(toolCalls);

  return (
    <div className={cn("rounded-xl border bg-card p-5 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon(result.status)}
            <ExecutionStatusBadge status={result.status} compact />
            {result.progress && (
              <span className="text-xs text-muted-foreground">
                {result.progress.completed}/{result.progress.total} steps
              </span>
            )}
          </div>
          <h3 className="font-semibold text-lg text-foreground break-words">
            {result.title}
          </h3>
          <div className="text-sm text-muted-foreground mt-1">
            {getStatusText(result.status)}
          </div>
        </div>
        <div className="flex gap-2">
          {onRetry && (result.status === "partial" || result.status === "failed") && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="shrink-0"
              title="Retry failed steps"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          )}
          {(result.status === "completed" || result.status === "partial") && onCreateTask && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateTaskDialog(true)}
              className="shrink-0"
              title="Create task for next steps"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Task
            </Button>
          )}
        </div>
      </div>

      {/* Summary - Always visible at top */}
      <div className="space-y-2">
        <div className="text-sm text-foreground leading-relaxed">
          {result.summary}
        </div>
      </div>

      {/* Progress Bar */}
      {result.progress && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Progress
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round(result.progress.completed / result.progress.total * 100)}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {result.progress.completed} / {result.progress.total} steps completed
          </div>
        </div>
      )}

      {/* Changes */}
      {result.changes && result.changes.length > 0 && (
        <div className="space-y-1.5">
          <button
            onClick={() => toggleSection("changes")}
            className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity"
          >
            {expandedSections.has("changes") ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Changes ({result.changes.length})
            </div>
          </button>
          {expandedSections.has("changes") && (
            <ul className="space-y-1.5 ml-6 mt-2">
              {result.changes.map((change, idx) => (
                <li key={idx} className="text-sm flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Verification */}
      {result.verification && result.verification.length > 0 && (
        <div className="space-y-1.5">
          <button
            onClick={() => toggleSection("verification")}
            className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity"
          >
            {expandedSections.has("verification") ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Verification
            </div>
          </button>
          {expandedSections.has("verification") && (
            <ul className="space-y-1.5 ml-6 mt-2">
              {result.verification.map((item, idx) => (
                <li key={idx} className="text-sm flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Issues */}
      {result.issues && result.issues.length > 0 && (
        <div className="space-y-1.5 bg-amber-50/50 dark:bg-amber-950/10 rounded-lg p-3">
          <button
            onClick={() => toggleSection("issues")}
            className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity"
          >
            {expandedSections.has("issues") ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Issues ({result.issues.length})
            </div>
          </button>
          {expandedSections.has("issues") && (
            <div className="space-y-2.5 ml-6 mt-2">
              {result.issues.map((issue, idx) => (
                <div key={idx} className="text-sm space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-amber-900 dark:text-amber-200">
                        ⚠ {issue.message}
                      </div>
                      {issue.reason && (
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          Reason: {issue.reason}
                        </div>
                      )}
                      {issue.target && (
                        <div className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-mono">
                          Target: {issue.target}
                        </div>
                      )}
                      {issue.retryable && (
                        <div className="text-amber-600 dark:text-amber-400 mt-2">
                          <button
                            onClick={() => issue.stepId && onRetryStep?.(issue.stepId)}
                            className="text-xs underline hover:no-underline"
                          >
                            [Retry Step]
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Next Action */}
      {result.nextAction && (
        <div className="bg-blue-50/50 dark:bg-blue-950/10 rounded-lg p-3 space-y-1.5">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
            Next Action
          </div>
          <div className="text-sm text-blue-900 dark:text-blue-200">
            {result.nextAction}
          </div>
        </div>
      )}

      {/* Tool Activity Summary */}
      {toolCalls.length > 0 && (
        <div className="border-t pt-3 mt-3">
          <button
            onClick={() => setIsToolLogExpanded(!isToolLogExpanded)}
            className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity"
          >
            {isToolLogExpanded ? (
              <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Tool Activity · {toolCalls.length} tools
            </div>
          </button>

          {isToolLogExpanded && (
            <div className="mt-3 space-y-2 pl-6">
              {toolGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    {group[0].name.includes("discover") || group[0].name.includes("scan") || group[0].name.includes("get")
                      ? "Discovery"
                      : group[0].name.includes("edit") || group[0].name.includes("create") || group[0].name.includes("set")
                        ? "Execution"
                        : "Technical"}
                  </div>
                  <ul className="space-y-1">
                    {group.map((call) => (
                      <li key={call.id} className="text-xs flex items-center gap-1.5">
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                        <span className="truncate">
                          {call.name.replace(/^roblox_/, "")}
                          {call.duration && (
                            <span className="text-muted-foreground ml-1">
                              · {formatDuration(call.duration)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Task Dialog */}
      {showCreateTaskDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Task</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a task for these changes to track them in the Task Panel
            </p>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTask();
                if (e.key === "Escape") setShowCreateTaskDialog(false);
              }}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateTaskDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateTask}
                disabled={!taskTitle.trim()}
                className="flex-1"
              >
                Create Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}