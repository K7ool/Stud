/**
 * Compact execution mode selector for the chat composer.
 *
 * Renders as a single button ("Auto") that opens a popover with:
 *   - Execution mode: Instant / Auto / Plan
 *   - Auto-queue toggle
 *
 * Thinking-effort shaping has been removed: provider options no longer
 * include reasoning_effort / thinking parameters, so there is nothing
 * for the user to control there.
 */

import { useState } from "react";
import { Zap, Brain, ListChecks, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/tasks";
import { cn } from "@/lib/utils";
import type { TaskMode } from "@/lib/chat/api";

const MODE_OPTIONS: { value: TaskMode; label: string; icon: typeof Zap; desc: string }[] = [
  { value: "instant", label: "Instant", icon: Zap, desc: "Skip planning. Direct execution." },
  { value: "auto", label: "Auto", icon: Brain, desc: "Smart detection: plan only when useful." },
  { value: "plan", label: "Plan", icon: ListChecks, desc: "Show plan and wait for approval." },
];

export function ExecutionModeSelector() {
  const mode = useTaskStore((s) => s.settings.mode);
  const autoQueue = useTaskStore((s) => s.settings.autoQueue);
  const setMode = useTaskStore((s) => s.setMode);
  const setAutoQueue = useTaskStore((s) => s.setAutoQueue);
  const isOpen = useTaskStore((s) => s.tasks.some((t) => t.status === "running"));

  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className={cn("h-8 text-xs gap-1", isOpen && "ring-1 ring-primary/30")}
        onClick={() => setOpen((v) => !v)}
        title="Execution mode"
      >
        <Brain className="w-3.5 h-3.5" />
        <span className="capitalize">{mode}</span>
        {isOpen && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-40 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 space-y-3">
            <section>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                Execution
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setMode(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md p-2 text-xs transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                      title={opt.desc}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {MODE_OPTIONS.find((o) => o.value === mode)?.desc}
              </p>
            </section>

            <section>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoQueue}
                  onChange={(e) => setAutoQueue(e.target.checked)}
                  className="rounded"
                />
                Auto-queue new requests when busy
              </label>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                When you're already running a task, explicit "do X" requests join the queue
                instead of interrupting.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
