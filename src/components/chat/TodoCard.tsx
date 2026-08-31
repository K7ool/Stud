import React, { useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  CircleDashed,
  AlertCircle,
  X,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  SkipForward,
  Layers,
  Wrench,
  FileCode,
  Box,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/stores/tasks";
import { groupSteps } from "@/lib/ai/todo";
import type { Task, TaskStep, StepStatus } from "@/lib/chat/api";

interface TodoCardProps {
  taskId?: string;
  className?: string;
}

export function TodoCard({ taskId, className }: TodoCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Subscribe to task state
  const task = useTaskStore((s) => {
    if (taskId) return s.tasks.find((t) => t.id === taskId) || null;
    return s.currentTask();
  });

  const retryStep = useTaskStore((s) => s.retryStep);
  const skipStep = useTaskStore((s) => s.skipStep);
  const unblockStep = useTaskStore((s) => s.unblockStep);
  const startStep = useTaskStore((s) => s.startStep);
  const cancelTask = useTaskStore((s) => s.cancel);

  if (!task || !task.steps || task.steps.length === 0) {
    return null;
  }

  const completedCount = task.steps.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;
  const totalCount = task.steps.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);
  const activeStep = task.steps.find((s) => s.status === "in_progress");
  const failedStep = task.steps.find((s) => s.status === "failed");
  const blockedStep = task.steps.find((s) => s.status === "blocked");
  const grouped = groupSteps(task.steps);

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "in_progress":
        return <CircleDot className="w-4 h-4 text-primary animate-pulse shrink-0" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
      case "blocked":
        return <CircleDashed className="w-4 h-4 text-amber-500 shrink-0" />;
      case "skipped":
        return <X className="w-4 h-4 text-muted-foreground shrink-0" />;
      case "cancelled":
        return <X className="w-4 h-4 text-muted-foreground shrink-0" />;
      default:
        return <CircleDashed className="w-4 h-4 text-muted-foreground/60 shrink-0" />;
    }
  };

  const getStatusBadge = () => {
    if (task.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> Completed
        </span>
      );
    }
    if (task.status === "failed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
          <AlertCircle className="w-3 h-3" /> Failed
        </span>
      );
    }
    if (task.status === "running") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          Running
        </span>
      );
    }
    if (task.status === "paused" || blockedStep) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
          Blocked
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
        Queued
      </span>
    );
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden transition-all duration-200",
        task.status === "running" && "ring-1 ring-primary/30 border-primary/40",
        className
      )}
    >
      {/* Header bar */}
      <div className="p-4 bg-muted/30 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-sm text-foreground truncate" title={task.title}>
                  {task.title}
                </h4>
                {getStatusBadge()}
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider px-1.5 py-0.2 rounded bg-muted">
                  {task.mode}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span>{completedCount} of {totalCount} tasks completed</span>
                <span>•</span>
                <span className="font-medium text-foreground">{progressPct}%</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? "Expand plan" : "Collapse plan"}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Active step spotlight banner */}
        {!collapsed && activeStep && (
          <div className="mt-3 p-2.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CircleDot className="w-4 h-4 text-primary animate-pulse shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-primary uppercase tracking-wider block">
                  Current Step
                </span>
                <span className="text-xs font-medium text-foreground truncate block" title={activeStep.title}>
                  {activeStep.title}
                </span>
              </div>
            </div>
            {activeStep.group && (
              <span className="text-[10px] font-medium text-muted-foreground px-2 py-0.5 rounded bg-background/80 border shrink-0">
                {activeStep.group}
              </span>
            )}
          </div>
        )}

        {/* Blocked step warning banner */}
        {!collapsed && blockedStep && !activeStep && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider block">
                  Task Blocked
                </span>
                <span className="text-xs text-amber-700 dark:text-amber-400 truncate block">
                  {blockedStep.blockedReason || "Waiting on prerequisites or connection"}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs border-amber-500/30 text-amber-700 hover:bg-amber-500/10 shrink-0"
              onClick={() => unblockStep(task.id, blockedStep.id)}
            >
              Resume
            </Button>
          </div>
        )}
      </div>

      {/* Collapsible Step List */}
      {!collapsed && (
        <div className="p-3 divide-y divide-border/40 max-h-80 overflow-y-auto">
          {grouped.map(({ group, steps }) => (
            <div key={group} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
              {grouped.length > 1 && (
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
                  <span>{group}</span>
                  <span className="text-[10px] font-normal">
                    {steps.filter((s) => s.status === "completed" || s.status === "skipped").length}/{steps.length}
                  </span>
                </div>
              )}

              {steps.map((step) => {
                const isExpanded = expandedStepId === step.id;
                return (
                  <div
                    key={step.id}
                    className={cn(
                      "group rounded-xl p-2.5 transition-all text-xs border border-transparent",
                      step.status === "in_progress" && "bg-primary/5 border-primary/20",
                      step.status === "failed" && "bg-red-500/5 border-red-500/20",
                      step.status === "blocked" && "bg-amber-500/5 border-amber-500/20",
                      step.status === "completed" && "hover:bg-muted/40",
                      step.status === "pending" && "hover:bg-muted/30"
                    )}
                  >
                    <div
                      className="flex items-start justify-between gap-2.5 cursor-pointer"
                      onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="mt-0.5">{getStepIcon(step.status)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-medium text-foreground break-words",
                                (step.status === "completed" || step.status === "skipped") &&
                                  "line-through text-muted-foreground"
                              )}
                            >
                              {step.title}
                            </span>
                            {step.priority === "high" && (
                              <span className="text-[9px] font-semibold text-amber-600 uppercase">high</span>
                            )}
                          </div>

                          {/* Quick details snippet */}
                          {step.result && !isExpanded && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 italic">
                              ✓ {step.result}
                            </p>
                          )}
                          {step.error && !isExpanded && (
                            <p className="text-[11px] text-red-500 mt-0.5 line-clamp-1 font-medium">
                              ⚠ {step.error}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons on step */}
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                        {step.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] text-red-600 border-red-500/30 hover:bg-red-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              retryStep(task.id, step.id);
                            }}
                            title="Retry step"
                          >
                            <RotateCw className="w-2.5 h-2.5 mr-1" /> Retry
                          </Button>
                        )}
                        {step.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              startStep(task.id, step.id);
                            }}
                            title="Run step now"
                          >
                            <Play className="w-2.5 h-2.5" />
                          </Button>
                        )}
                        {(step.status === "pending" || step.status === "in_progress") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              skipStep(task.id, step.id, "Skipped by user");
                            }}
                            title="Skip step"
                          >
                            <SkipForward className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Step inspector / detailed metadata drawer */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 space-y-2 text-[11px] text-muted-foreground">
                        {step.result && (
                          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                            <span className="font-semibold block mb-0.5">Execution Result:</span>
                            <span>{step.result}</span>
                          </div>
                        )}

                        {step.error && (
                          <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20 text-red-700 dark:text-red-400">
                            <span className="font-semibold block mb-0.5">Error:</span>
                            <span>{step.error}</span>
                          </div>
                        )}

                        {step.blockedReason && (
                          <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                            <span className="font-semibold block mb-0.5">Blocked Reason:</span>
                            <span>{step.blockedReason}</span>
                          </div>
                        )}

                        {step.dependsOn && step.dependsOn.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">Prerequisites:</span>
                            {step.dependsOn.map((depId) => {
                              const depStep = task.steps.find((s) => s.id === depId);
                              return (
                                <span
                                  key={depId}
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                    depStep?.status === "completed"
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : "bg-muted text-muted-foreground border-border"
                                  )}
                                >
                                  {depStep?.title || depId}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {step.toolsUsed && step.toolsUsed.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold flex items-center gap-1">
                              <Wrench className="w-3 h-3" /> Tools:
                            </span>
                            {step.toolsUsed.map((tool) => (
                              <span key={tool} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}

                        {step.relatedFiles && step.relatedFiles.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold flex items-center gap-1">
                              <FileCode className="w-3 h-3" /> Files:
                            </span>
                            {step.relatedFiles.map((file) => (
                              <span key={file} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                                {file}
                              </span>
                            ))}
                          </div>
                        )}

                        {step.relatedInstances && step.relatedInstances.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold flex items-center gap-1">
                              <Box className="w-3 h-3" /> Instances:
                            </span>
                            {step.relatedInstances.map((inst) => (
                              <span key={inst} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">
                                {inst}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground/80">
                          {step.attempts && step.attempts > 1 ? (
                            <span>Attempts: {step.attempts}</span>
                          ) : (
                            <span />
                          )}
                          {step.completedAt && (
                            <span>Finished {new Date(step.completedAt).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
