import React from "react";
import { cn } from "@/lib/utils";
import { Loader, CheckCircle2, Circle } from "lucide-react";

export interface LiveProgressStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

interface LiveProgressIndicatorProps {
  title: string;
  steps: LiveProgressStep[];
  currentStepIndex?: number;
  className?: string;
}

export function LiveProgressIndicator({
  title,
  steps,
  currentStepIndex,
  className,
}: LiveProgressIndicatorProps) {
  if (!steps || steps.length === 0) return null;

  const completed = steps.filter((s) => s.status === "completed").length;
  const inProgress = steps.filter((s) => s.status === "in_progress").length;
  const progress = Math.round((completed / steps.length) * 100);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">
          {completed}/{steps.length} steps
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps list */}
      <ul className="space-y-1">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2 text-sm">
            {step.status === "completed" && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            {step.status === "in_progress" && (
              <Loader className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            )}
            {step.status === "pending" && (
              <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                "text-foreground",
                step.status === "completed" && "text-muted-foreground line-through",
                step.status === "in_progress" && "font-medium text-primary"
              )}
            >
              {step.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
