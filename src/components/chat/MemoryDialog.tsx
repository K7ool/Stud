/**
 * Memory management dialog.
 *
 * Lists every saved memory, grouped by scope (Project / Global / Session),
 * and lets the user edit, delete, or "forget all". Created memories are
 * read-only externally — this is the only surface to manage them.
 */

import { useMemo, useState } from "react";
import { Trash2, Brain, AlertTriangle, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemoryStore, type MemoryState } from "@/stores/memory";
import { getStudioSiteId } from "@/lib/roblox/client";
import { cn } from "@/lib/utils";
import type { Memory } from "@/lib/chat/api";

interface MemoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  USER_PREFERENCES: "Preferences",
  PROJECT_CONTEXT: "Project",
  CODING_PREFERENCES: "Code style",
  WORKFLOW_PREFERENCES: "Workflow",
  IMPORTANT_FACTS: "Facts",
  ACTIVE_GOALS: "Active goals",
  COMMON_PATTERNS: "Patterns",
  IMPORTANT_DECISIONS: "Decisions",
};

const SCOPE_LABEL: Record<string, string> = {
  global: "Global",
  project: "Project",
  session: "Session",
};

function Row({
  memory,
  onDelete,
  onUpdate,
}: {
  memory: Memory;
  onDelete: () => void;
  onUpdate: (patch: Partial<Memory>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memory.value);
  const confidencePct = Math.round(memory.confidence * 100);

  return (
    <div className="group border rounded-lg p-3 bg-card hover:border-foreground/20 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{CATEGORY_LABEL[memory.category] || memory.category}</span>
            <span className="opacity-50">·</span>
            <span>{SCOPE_LABEL[memory.scope]}</span>
            <span className="opacity-50">·</span>
            <span title={`${memory.key}`} className="font-mono text-[10px] truncate max-w-[160px]">
              {memory.key}
            </span>
          </div>
          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-7 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onUpdate({ value });
                    setEditing(false);
                  }
                  if (e.key === "Escape") {
                    setValue(memory.value);
                    setEditing(false);
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  onUpdate({ value });
                  setEditing(false);
                }}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setValue(memory.value);
                  setEditing(false);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <p
              className="mt-1 text-sm leading-relaxed cursor-text"
              onClick={() => setEditing(true)}
            >
              {memory.value}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full",
                  memory.confidence > 0.7 ? "bg-emerald-500" : memory.confidence > 0.4 ? "bg-amber-500" : "bg-zinc-400"
                )}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <span>{confidencePct}% confidence</span>
            <span className="opacity-50">·</span>
            <span>updated {new Date(memory.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100"
          onClick={onDelete}
          title="Forget this"
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function MemoryDialog({ open, onOpenChange }: MemoryDialogProps) {
  const memories = useMemoryStore((s) => s.memories);
  const removeMemory = useMemoryStore((s) => s.removeMemory);
  const updateMemory = useMemoryStore((s) => s.updateMemory);
  const forgetAll = useMemoryStore((s) => s.forgetAll);
  const siteId = getStudioSiteId();

  const grouped = useMemo(() => {
    const project: Memory[] = [];
    const global: Memory[] = [];
    const session: Memory[] = [];
    for (const m of memories) {
      if (m.scope === "global") global.push(m);
      else if (m.scope === "project" && (!siteId || m.projectId === siteId)) project.push(m);
      else if (m.scope === "session") session.push(m);
    }
    return { project, global, session };
  }, [memories, siteId]);

  const total = memories.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Memory
              <span className="text-xs text-muted-foreground font-normal">
                {total} stored
              </span>
            </DialogTitle>
            {total > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Forget all ${total} memories? This cannot be undone.`)) {
                    forgetAll();
                  }
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Forget all
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Project memory is scoped to the current Roblox project (site{" "}
            <span className="font-mono">{siteId.slice(0, 8)}</span>). Global
            memory applies across all projects. Click a value to edit.
          </p>
        </DialogHeader>
        <div className="overflow-y-auto p-5 space-y-5">
          {total === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No memories yet.</p>
              <p className="text-xs mt-1">
                Try saying <em>"remember that I prefer concise explanations"</em>.
              </p>
            </div>
          ) : (
            <>
              {grouped.project.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Project
                  </h3>
                  <div className="space-y-2">
                    {grouped.project.map((m) => (
                      <Row
                        key={m.id}
                        memory={m}
                        onDelete={() => removeMemory(m.id)}
                        onUpdate={(patch) => updateMemory(m.id, patch)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {grouped.global.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Preferences
                  </h3>
                  <div className="space-y-2">
                    {grouped.global.map((m) => (
                      <Row
                        key={m.id}
                        memory={m}
                        onDelete={() => removeMemory(m.id)}
                        onUpdate={(patch) => updateMemory(m.id, patch)}
                      />
                    ))}
                  </div>
                </section>
              )}
              {grouped.session.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Session
                  </h3>
                  <div className="space-y-2">
                    {grouped.session.map((m) => (
                      <Row
                        key={m.id}
                        memory={m}
                        onDelete={() => removeMemory(m.id)}
                        onUpdate={(patch) => updateMemory(m.id, patch)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
