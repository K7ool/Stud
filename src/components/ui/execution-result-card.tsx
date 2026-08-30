import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ExecutionStatusBadge, type ExecutionStatus } from "./execution-status-badge";
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, RotateCw } from "lucide-react";
import { Button } from "./button";
import type { ExecutionResult, ExecutionIssue } from "@/stores/chat";

interface ExecutionResultCardProps {
  result: ExecutionResult;
  toolCallCount?: number;
  onRetry?: () => void;
  className?: string;
}

export function ExecutionResultCard({
  result,
  toolCallCount = 0,
  onRetry,
  className,
}: ExecutionResultCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary"])
  );

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpandedSections(next);
  };

  const progress = result.progress
    ? Math.round((result.progress.completed / result.progress.total) * 100)
    : undefined;

  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden bg-card transition-all",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <ExecutionStatusBadge status={result.status} compact />
            {progress !== undefined && (
              <span className="text-xs text-muted-foreground">
                {result.progress?.completed}/{result.progress?.total}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-base text-foreground break-words">
            {result.title}
          </h3>
        </div>
        {onRetry && (result.status === "partial" || result.status === "failed") && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="shrink-0"
            title="Retry failed steps"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {progress !== undefined && (
        <div className="px-4 py-2 bg-muted/20 border-b">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="divide-y">
        {/* Summary */}
        {result.summary && (
          <div className="px-4 py-3">
            <button
              onClick={() => toggleSection("summary")}
              className="flex items-start gap-2 w-full text-left hover:opacity-75 transition-opacity"
            >
              {expandedSections.has("summary") ? (
                <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Summary
                </p>
                {!expandedSections.has("summary") && (
                  <p className="text-sm text-foreground line-clamp-1">
                    {result.summary}
                  </p>
                )}
              </div>
            </button>
            {expandedSections.has("summary") && (
              <div className="mt-2 ml-6 text-sm text-foreground leading-relaxed">
                {result.summary}
              </div>
            )}
          </div>
        )}

        {/* Changes */}
        {result.changes && result.changes.length > 0 && (
          <div className="px-4 py-3">
            <button
              onClick={() => toggleSection("changes")}
              className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity mb-2"
            >
              {expandedSections.has("changes") ? (
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Changes ({result.changes.length})
              </p>
            </button>
            {expandedSections.has("changes") && (
              <ul className="space-y-1.5 ml-6">
                {result.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-foreground">{change}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Verification */}
        {result.verification && result.verification.length > 0 && (
          <div className="px-4 py-3">
            <button
              onClick={() => toggleSection("verification")}
              className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity mb-2"
            >
              {expandedSections.has("verification") ? (
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              )}
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Verification
              </p>
            </button>
            {expandedSections.has("verification") && (
              <ul className="space-y-1.5 ml-6">
                {result.verification.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Issues */}
        {result.issues && result.issues.length > 0 && (
          <div className="px-4 py-3 bg-amber-50/50 dark:bg-amber-950/10">
            <button
              onClick={() => toggleSection("issues")}
              className="flex items-center gap-2 w-full text-left hover:opacity-75 transition-opacity mb-2"
            >
              {expandedSections.has("issues") ? (
                <ChevronDown className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                Issues ({result.issues.length})
              </p>
            </button>
            {expandedSections.has("issues") && (
              <div className="space-y-2.5 ml-6 mt-2">
                {result.issues.map((issue, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      ⚠ {issue.message}
                    </p>
                    {issue.target && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-mono">
                        Target: {issue.target}
                      </p>
                    )}
                    {issue.reason && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        Reason: {issue.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Next Action */}
        {result.nextAction && (
          <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-950/10">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-2">
              Next Action
            </p>
            <p className="text-sm text-blue-900 dark:text-blue-200">
              {result.nextAction}
            </p>
          </div>
        )}

        {/* Technical Details */}
        {expandedSections.has("technical") && (
              <div className="space-y-1.5 ml-6 mt-2 text-xs font-mono">
                {toolCallCount > 0 && (
                  <div className="text-muted-foreground">
                    · {toolCallCount} tool calls
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
