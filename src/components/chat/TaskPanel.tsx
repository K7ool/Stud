/**
 * Task + queue panel.
 *
 * Shows the current task with steps, a progress bar, the queue (with
 * reorder / cancel / priority controls), and a compact history list.
 * Stays out of the way: slide-in drawer similar to Sidebar; opens from a
 * single button in the chat header.
 */

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  X,
  Pause,
  Play,
  RotateCw,
  Trash2,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ListChecks,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Inbox,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/tasks";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus, TaskStep } from "@/lib/chat/api";

interface TaskPanelProps {
  open: boolean;
  onClose: () => void;
}

function statusIcon(s: TaskStatus) {
  switch (s) {
    case "running":
      return <CircleDot className="w-3.5 h-3.5 text-primary animate-pulse" />;
    case "paused":
      return <Pause className="w-3.5 h-3.5 text-amber-500" />;
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case "failed":
      return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    case "cancelled":
      return <X className="w-3.5 h-3.5 text-muted-foreground" />;
    case "needs_resume":
      return <RotateCw className="w-3.5 h-3.5 text-amber-500" />;
    default:
      return <CircleDashed className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function stepIcon(s: TaskStep) {
  if (s.status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (s.status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (s.status === "in_progress") return <CircleDot className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />;
  if (s.status === "blocked") return <CircleDashed className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  if (s.status === "cancelled") return <X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  if (s.status === "skipped") return <X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  return <CircleDashed className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function priorityBadge(p: TaskPriority) {
  if (p === "high") return <span className="text-[9px] uppercase tracking-wider text-amber-600 font-semibold">high</span>;
  if (p === "low") return <span className="text-[9px] uppercase tracking-wider text-muted-foreground">low</span>;
  return null;
}

function TaskRow({
  task,
  active,
  onCancel,
  onRetry,
  onStart,
  onPriority,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  task: Task;
  active: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onStart: () => void;
  onPriority: (p: TaskPriority) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const progressPct = Math.round((task.progress || 0) * 100);
  return (
    <div
      className={cn(
        "border rounded-lg p-3 bg-card text-sm",
        active && "ring-1 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-2">
        {statusIcon(task.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium truncate" title={task.title}>
              {task.title}
            </span>
            {priorityBadge(task.priority)}
            <span className="text-[10px] text-muted-foreground">
              · {task.mode} · {task.effort}
            </span>
          </div>
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-2">
            <span>{progressPct}%</span>
            {task.error && <span className="text-red-500 truncate" title={task.error}>· {task.error}</span>}
            {task.retryCount > 0 && <span>· retry {task.retryCount}</span>}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {!active && (task.status === "pending" || task.status === "paused") && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onStart} title="Run now">
              <Play className="w-3 h-3" />
            </Button>
          )}
          {(task.status === "failed" || task.status === "cancelled") && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRetry} title="Retry">
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
          {(task.status === "pending" || task.status === "paused" || task.status === "running") && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCancel} title="Cancel">
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      {!active && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            title="Move up"
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            title="Move down"
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
          <span className="ml-1">priority:</span>
          {(["high", "normal", "low"] as TaskPriority[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={task.priority === p ? "default" : "ghost"}
              className="h-6 px-1.5 text-[10px]"
              onClick={() => onPriority(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepsList({ steps, taskId }: { steps: TaskStep[]; taskId?: string }) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">No steps yet — the agent will plan as it goes.</div>
    );
  }
  const ts = useTaskStore.getState;
  return (
    <ul className="space-y-1.5">
      {steps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => {
          const pct = Math.round((s.stepProgress ?? 0) * 100);
          return (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              {stepIcon(s)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "leading-snug",
                      s.status === "completed" && "text-muted-foreground line-through",
                      s.status === "in_progress" && "text-foreground font-medium",
                      (s.status === "blocked" || s.status === "cancelled") && "text-muted-foreground"
                    )}
                  >
                    {s.title}
                  </div>
                  {s.priority === "high" && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-600 font-semibold">high</span>
                  )}
                </div>

                {s.blockedReason && s.status === "blocked" && (
                  <div className="text-[10px] text-amber-600 mt-0.5">{s.blockedReason}</div>
                )}

                {s.status === "in_progress" && s.stepProgress !== undefined && (
                  <div className="mt-1 h-1 w-full max-w-[220px] rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}

                {s.result && s.status === "completed" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.result}</div>
                )}
                {s.error && s.status === "failed" && (
                  <div className="text-[10px] text-red-500 mt-0.5">{s.error}</div>
                )}
                {s.attempts != null && s.attempts > 1 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">attempts: {s.attempts}</div>
                )}
              </div>
              {taskId && (s.status === "failed" || s.status === "blocked") && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {s.status === "blocked" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => ts().unblockStep(taskId, s.id)}
                      title="Unblock"
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                  )}
                  {s.status === "failed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => ts().startStep(taskId, s.id)}
                      title="Retry step"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
    </ul>
  );
}

export function TaskPanel({ open, onClose }: TaskPanelProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const currentTask = useTaskStore(useShallow((s) => s.currentTask()));
  const queue = useTaskStore(useShallow((s) => s.queue()));
  const history = useTaskStore(useShallow((s) => s.history()));
  const cancel = useTaskStore((s) => s.cancel);
  const retry = useTaskStore((s) => s.retry);
  const reorder = useTaskStore((s) => s.reorder);
  const patch = useTaskStore((s) => s.patch);
  const setStatus = useTaskStore((s) => s.setStatus);
  const startTask = useTaskStore((s) => s.startTask);

  const [tab, setTab] = useState<"active" | "queue" | "history">("active");

  // Find current running/needs_resume task
  const running = useMemo(
    () => tasks.find((t) => t.status === "running"),
    [tasks],
  );
  const needsResume = useMemo(
    () => tasks.find((t) => t.status === "needs_resume"),
    [tasks],
  );

  if (!open) return null;

  const onMoveUp = (id: string) => {
    const idx = queue.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const a = queue[idx - 1];
    const b = queue[idx];
    // swap queuePosition
    Promise.all([
      patch(a.id, { queuePosition: b.queuePosition }),
      patch(b.id, { queuePosition: a.queuePosition }),
    ]).then(() => reorder());
  };
  const onMoveDown = (id: string) => {
    const idx = queue.findIndex((t) => t.id === id);
    if (idx < 0 || idx === queue.length - 1) return;
    const a = queue[idx];
    const b = queue[idx + 1];
    Promise.all([
      patch(a.id, { queuePosition: b.queuePosition }),
      patch(b.id, { queuePosition: a.queuePosition }),
    ]).then(() => reorder());
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 max-w-[92vw] bg-card border-l shadow-xl flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Tasks</h2>
          {tasks.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {tasks.filter((t) => t.status === "running" || t.status === "pending" || t.status === "paused").length} active
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2">
        {(["active", "queue", "history"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setTab(k)}
          >
            {k === "active" ? "Active" : k === "queue" ? "Queue" : "History"}
            {k === "queue" && queue.length > 0 && <span className="ml-1 text-[10px] opacity-70">{queue.length}</span>}
            {k === "history" && history.length > 0 && <span className="ml-1 text-[10px] opacity-70">{history.length}</span>}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {needsResume && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
              <RotateCw className="w-3.5 h-3.5" />
              Task was interrupted
            </div>
            <p className="text-xs text-amber-700/80">
              <span className="font-medium">{needsResume.title}</span> was running when the page closed.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7" onClick={() => startTask(needsResume.id)}>
                Resume
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => cancel(needsResume.id)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {tab === "active" && (
          <>
            {running ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <CircleDot className="w-3.5 h-3.5 text-primary animate-pulse" />
                  <span>Running</span>
                  {priorityBadge(running.priority)}
                </div>
                <TaskRow
                  task={running}
                  active
                  onCancel={() => cancel(running.id)}
                  onRetry={() => retry(running.id)}
                  onStart={() => startTask(running.id)}
                  onPriority={(p) => patch(running.id, { priority: p })}
                  canMoveUp={false}
                  canMoveDown={false}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                />
                <div className="border rounded-lg p-3 bg-background/50">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Plan
                  </div>
                  <StepsList steps={running.steps} taskId={running.id} />
                </div>
              </div>
            ) : currentTask ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <CircleDashed className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Up next</span>
                </div>
                <TaskRow
                  task={currentTask}
                  active
                  onCancel={() => cancel(currentTask.id)}
                  onRetry={() => retry(currentTask.id)}
                  onStart={() => startTask(currentTask.id)}
                  onPriority={(p) => patch(currentTask.id, { priority: p })}
                  canMoveUp={false}
                  canMoveDown={false}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                />
                <div className="border rounded-lg p-3 bg-background/50">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                    Plan
                  </div>
                  <StepsList steps={currentTask.steps} taskId={currentTask.id} />
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No active task. Send a message to start one.
              </div>
            )}
          </>
        )}

        {tab === "queue" && (
          <>
            {queue.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Queue is empty.
              </div>
            ) : (
              queue.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  active={false}
                  onCancel={() => cancel(t.id)}
                  onRetry={() => retry(t.id)}
                  onStart={() => startTask(t.id)}
                  onPriority={(p) => patch(t.id, { priority: p })}
                  canMoveUp={i > 0}
                  canMoveDown={i < queue.length - 1}
                  onMoveUp={() => onMoveUp(t.id)}
                  onMoveDown={() => onMoveDown(t.id)}
                />
              ))
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No completed tasks yet.
              </div>
            ) : (
              history.map((t) => (
                <div
                  key={t.id}
                  className="border rounded-lg p-3 bg-card text-sm flex items-start gap-2"
                >
                  {statusIcon(t.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" title={t.title}>
                      {t.title}
                    </div>
                    {t.result?.summary && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {t.result.summary}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {t.completedAt
                        ? new Date(t.completedAt).toLocaleString()
                        : ""}
                      {t.result?.duration ? ` · ${Math.round(t.result.duration / 1000)}s` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
