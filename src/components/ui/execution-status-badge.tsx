import React from "react";
import { cn } from "@/lib/utils";
import { Check, AlertCircle, X, Pause } from "lucide-react";

export type ExecutionStatus = "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";

interface ExecutionStatusBadgeProps {
  status: ExecutionStatus;
  compact?: boolean;
  className?: string;
}

const statusConfigs: Record<
  ExecutionStatus,
  {
    icon: React.ReactNode;
    label: string;
    textColor: string;
    bgColor: string;
  }
> = {
  completed: {
    icon: "✓",
    label: "Completed",
    textColor: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  partial: {
    icon: "◐",
    label: "Partially Completed",
    textColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/20",
  },
  failed: {
    icon: "✕",
    label: "Failed",
    textColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/20",
  },
  blocked: {
    icon: "⏸",
    label: "Blocked",
    textColor: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-950/20",
  },
  cancelled: {
    icon: "⏹",
    label: "Cancelled",
    textColor: "text-muted-foreground",
    bgColor: "bg-muted/50",
  },
  in_progress: {
    icon: "◉",
    label: "In Progress",
    textColor: "text-primary",
    bgColor: "bg-primary/5",
  },
};

export function ExecutionStatusBadge({
  status,
  compact = false,
  className,
}: ExecutionStatusBadgeProps) {
  const config = statusConfigs[status];

  if (compact) {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm font-medium", config.textColor, className)}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg border",
        config.bgColor,
        config.textColor,
        "border-current/20",
        className
      )}
    >
      <span className="text-lg">{config.icon}</span>
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}
