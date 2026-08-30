/**
 * Compact execution mode + thinking effort selector for the chat composer.
 *
 * Renders as a single button ("Luna · Auto · Medium") that opens a popover
 * with three sections:
 *   - Execution mode: Instant / Auto / Plan
 *   - Thinking: Auto / Low / Medium / High
 *   - Auto-queue toggle
 *
 * Surfaces a notice when the active model doesn't support effort shaping
 * (e.g. gpt-4o or Codex OAuth).
 */

import { useState } from "react";
import { Zap, Brain, ListChecks, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/tasks";
import { useSettingsStore } from "@/stores/settings";
import { supportsEffortShaping, describeEffort, type EffortLevel } from "@/lib/ai/effort";
import { cn } from "@/lib/utils";
import type { TaskEffort, TaskMode } from "@/lib/chat/api";

const MODE_OPTIONS: { value: TaskMode; label: string; icon: typeof Zap; desc: string }[] = [
  { value: "instant", label: "Instant", icon: Zap, desc: "Skip planning. Direct execution." },
  { value: "auto", label: "Auto", icon: Brain, desc: "Smart detection: plan only when useful." },
  { value: "plan", label: "Plan", icon: ListChecks, desc: "Show plan and wait for approval." },
];

const EFFORT_OPTIONS: { value: EffortLevel; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "Pick based on task complexity." },
  { value: "low", label: "Low", desc: "Fast, minimal reasoning." },
  { value: "medium", label: "Medium", desc: "Balanced speed and reasoning." },
  { value: "high", label: "High", desc: "Deep reasoning, more verification." },
];

export function ExecutionModeSelector() {
  const mode = useTaskStore((s) => s.settings.mode);
  const effort = useTaskStore((s) => s.settings.effort);
  const autoQueue = useTaskStore((s) => s.settings.autoQueue);
  const setMode = useTaskStore((s) => s.setMode);
  const setEffort = useTaskStore((s) => s.setEffort);
  const setAutoQueue = useTaskStore((s) => s.setAutoQueue);
  const selectedProvider = useSettingsStore((s) => s.selectedProvider);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const isOpen = useTaskStore((s) => s.tasks.some((t) => t.status === "running"));

  const [open, setOpen] = useState(false);
  const supports = supportsEffortShaping(selectedProvider, selectedModel);
  const effectiveEffort = effort === "auto" ? "medium" : effort;
  const label = describeEffort(selectedProvider, selectedModel, effort);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className={cn("h-8 text-xs gap-1", isOpen && "ring-1 ring-primary/30")}
        onClick={() => setOpen((v) => !v)}
        title="Execution mode & thinking effort"
      >
        <Brain className="w-3.5 h-3.5" />
        <span className="capitalize">{mode}</span>
        <span className="opacity-50">·</span>
        <span className="capitalize">{effort === "auto" ? "Auto" : effectiveEffort}</span>
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                Thinking
              </div>
              <div className="grid grid-cols-4 gap-1">
                {EFFORT_OPTIONS.map((opt) => {
                  const active = effort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setEffort(opt.value as TaskEffort)}
                      className={cn(
                        "rounded-md py-1.5 text-xs transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground flex items-start gap-1">
                {!supports ? (
                  <>
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      {selectedModel} on {selectedProvider} doesn't expose reasoning controls. The
                      selector is advisory.
                    </span>
                  </>
                ) : (
                  <span>
                    Selected model supports native effort control. The current setting is{" "}
                    <span className="font-medium text-foreground">{label}</span>.
                  </span>
                )}
              </div>
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
