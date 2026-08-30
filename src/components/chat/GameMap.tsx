import { useEffect, useState, useMemo } from "react";
import { useGameMapStore, GameFeature, FeatureSuggestion } from "@/stores/gameMap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  Map,
  Plus,
  Check,
  Clock,
  Lightbulb,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader2,
  Trash2,
  GitFork,
  Play,
  Layers,
  ChevronRight,
} from "lucide-react";

interface GameMapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSuggestion: (prompt: string, childName?: string) => void;
}

export function GameMap({ open, onOpenChange, onSelectSuggestion }: GameMapProps) {
  const {
    rootFeature,
    features,
    suggestions,
    updateFeature,
    addFeature,
    setRootFeature,
    deleteFeature,
    fetchSuggestions,
    clearSuggestions,
  } = useGameMapStore();
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [viewMode, setViewMode] = useState<"graph" | "tree">("graph");

  const allFeatures = useMemo(() => {
    return rootFeature
      ? [rootFeature, ...flattenFeatures(features)]
      : flattenFeatures(features);
  }, [rootFeature, features]);

  // Set default selection if none
  useEffect(() => {
    if (open && !selectedFeatureId && allFeatures.length > 0) {
      setSelectedFeatureId(allFeatures[0].id);
    }
  }, [open, selectedFeatureId, allFeatures]);

  const selectedFeature = selectedFeatureId
    ? allFeatures.find((f) => f.id === selectedFeatureId) ?? null
    : null;
  const suggestionState = selectedFeatureId
    ? suggestions[selectedFeatureId]
    : undefined;

  // Fetch AI suggestions whenever selected feature changes
  useEffect(() => {
    if (!open || !selectedFeatureId) return;
    useGameMapStore.getState().fetchSuggestions(selectedFeatureId);
  }, [open, selectedFeatureId]);

  const handleMakeIt = (
    parentId: string,
    suggestion: FeatureSuggestion
  ) => {
    addFeature(parentId, {
      name: suggestion.label,
      description: suggestion.description,
      status: "in-progress",
    });
    clearSuggestions(parentId);
    const prompt = `Build and integrate "${suggestion.label}" (${suggestion.description}) into the game. Create the required Luau scripts, instances, and UI, and mark the game map feature as complete.`;
    onSelectSuggestion(prompt, suggestion.label);
    onOpenChange(false);
  };

  const handleBootstrapRoot = (suggestion: FeatureSuggestion) => {
    setRootFeature({
      name: suggestion.label,
      description: suggestion.description,
      status: "in-progress",
    });
    onSelectSuggestion(
      `Build the core feature "${suggestion.label}" (${suggestion.description}) in Roblox Studio. Create all necessary scripts and structures for the game map.`,
      suggestion.label
    );
    onOpenChange(false);
  };

  const handleAddCustomChild = (parentId: string) => {
    const name = newChildName.trim();
    if (!name) return;
    addFeature(parentId, {
      name,
      description: "Added manually",
      status: "idea",
    });
    setNewChildName("");
    setAddingChildTo(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="border-b pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg flex items-center gap-2">
                Connected Game Map
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium border border-emerald-500/20">
                  Lemonade Flow
                </span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Visual feature dependencies and 1-click AI generation pipeline
              </p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            <Button
              size="sm"
              variant={viewMode === "graph" ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5 gap-1.5"
              onClick={() => setViewMode("graph")}
            >
              <GitFork className="w-3.5 h-3.5" />
              Connected Map
            </Button>
            <Button
              size="sm"
              variant={viewMode === "tree" ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5 gap-1.5"
              onClick={() => setViewMode("tree")}
            >
              <Layers className="w-3.5 h-3.5" />
              Hierarchy
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 gap-5 min-h-0 pt-3">
          {/* Main Visual Connected Canvas / Tree */}
          <div className="w-7/12 border rounded-xl p-4 overflow-y-auto bg-muted/10 relative flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Game Blueprint Nodes
              </h3>
              <span className="text-[11px] text-muted-foreground font-mono">
                {allFeatures.length} Active Nodes
              </span>
            </div>

            {!rootFeature && features.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Map className="w-6 h-6" />
                </div>
                <div className="max-w-xs">
                  <h4 className="font-medium text-sm">No Features in Map Yet</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select one of the suggested game concepts on the right to start building your game tree!
                  </p>
                </div>
              </div>
            ) : viewMode === "graph" ? (
              /* Lemonade.gg-style Node Graph View */
              <div className="flex-1 overflow-auto space-y-6 py-2">
                {rootFeature && (
                  <GraphNodeTree
                    feature={rootFeature}
                    selectedId={selectedFeatureId}
                    onSelect={setSelectedFeatureId}
                    onUpdate={updateFeature}
                    onDelete={deleteFeature}
                    onAddChild={(id) => {
                      setAddingChildTo(id);
                      setNewChildName("");
                    }}
                    addingChildTo={addingChildTo}
                    newChildName={newChildName}
                    setNewChildName={setNewChildName}
                    onSubmitChild={handleAddCustomChild}
                    onCancelChild={() => setAddingChildTo(null)}
                    isRoot
                  />
                )}
                {features.map((feature) => (
                  <GraphNodeTree
                    key={feature.id}
                    feature={feature}
                    selectedId={selectedFeatureId}
                    onSelect={setSelectedFeatureId}
                    onUpdate={updateFeature}
                    onDelete={deleteFeature}
                    onAddChild={(id) => {
                      setAddingChildTo(id);
                      setNewChildName("");
                    }}
                    addingChildTo={addingChildTo}
                    newChildName={newChildName}
                    setNewChildName={setNewChildName}
                    onSubmitChild={handleAddCustomChild}
                    onCancelChild={() => setAddingChildTo(null)}
                    isRoot={false}
                  />
                ))}
              </div>
            ) : (
              /* Tree Hierarchy View */
              <div className="flex-1 overflow-auto space-y-2">
                {rootFeature && (
                  <TreeFeatureItem
                    feature={rootFeature}
                    selectedId={selectedFeatureId}
                    onSelect={setSelectedFeatureId}
                    onUpdate={updateFeature}
                    onDelete={deleteFeature}
                    onAddChild={(id) => {
                      setAddingChildTo(id);
                      setNewChildName("");
                    }}
                    addingChildTo={addingChildTo}
                    newChildName={newChildName}
                    setNewChildName={setNewChildName}
                    onSubmitChild={handleAddCustomChild}
                    onCancelChild={() => setAddingChildTo(null)}
                    level={0}
                  />
                )}
                {features.map((feature) => (
                  <TreeFeatureItem
                    key={feature.id}
                    feature={feature}
                    selectedId={selectedFeatureId}
                    onSelect={setSelectedFeatureId}
                    onUpdate={updateFeature}
                    onDelete={deleteFeature}
                    onAddChild={(id) => {
                      setAddingChildTo(id);
                      setNewChildName("");
                    }}
                    addingChildTo={addingChildTo}
                    newChildName={newChildName}
                    setNewChildName={setNewChildName}
                    onSubmitChild={handleAddCustomChild}
                    onCancelChild={() => setAddingChildTo(null)}
                    level={0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* AI Suggestions & Instant Action Panel */}
          <div className="w-5/12 border rounded-xl p-4 overflow-y-auto bg-card flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b pb-2.5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold">AI Next Actions</h3>
              </div>
              {selectedFeatureId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const id = selectedFeatureId;
                    useGameMapStore.setState((s) => {
                      const next = { ...s.suggestions };
                      if (next[id]) {
                        next[id] = { ...next[id], fetchedAt: null };
                      }
                      return { suggestions: next };
                    });
                    useGameMapStore.getState().fetchSuggestions(id);
                  }}
                  className="h-7 px-2 text-xs gap-1"
                  title="Generate new ideas"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </Button>
              )}
            </div>

            {!selectedFeature && allFeatures.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Pick a starter game mechanic to initialize your connected map:
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Magic Wand Upgrade System", description: "Spellcasting wand with tier progression and particle bursts" },
                    { label: "Vehicle Racing Circuit", description: "Drivable cars with lap timers, checkpoints, and speedometer" },
                    { label: "Sword Combat & Stun Parry", description: "Melee combat system with hitboxes, block mechanics, and combos" },
                    { label: "Tycoon Economy Base", description: "Item dropper pads, conveyor belts, and automated currency saving" },
                  ].map((starter, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border bg-muted/20 hover:border-primary/50 transition-all flex flex-col gap-2 group"
                    >
                      <div>
                        <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          {starter.label}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{starter.description}</p>
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => handleBootstrapRoot(starter)}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Create & Make It
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : !selectedFeature ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Click any node on the left to see connected child feature ideas.
              </p>
            ) : (
              <div className="space-y-3 flex-1 flex flex-col">
                <div className="p-2.5 rounded-lg bg-muted/40 border text-xs">
                  <span className="text-muted-foreground">Selected Feature:</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5 flex items-center gap-1.5">
                    {selectedFeature.name}
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-primary/10 text-primary uppercase">
                      {selectedFeature.status}
                    </span>
                  </p>
                </div>

                {suggestionState?.loading && (
                  <div className="space-y-2.5 py-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border bg-muted/30 animate-pulse space-y-2"
                      >
                        <div className="h-4 bg-muted rounded w-2/3" />
                        <div className="h-3 bg-muted rounded w-full" />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      Designing connected suggestions…
                    </p>
                  </div>
                )}

                {!suggestionState?.loading && suggestionState?.error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-destructive">Suggestion Notice</p>
                        <p className="text-muted-foreground mt-0.5">{suggestionState.error}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() => useGameMapStore.getState().fetchSuggestions(selectedFeature.id)}
                        >
                          Try Again
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {!suggestionState?.loading && (suggestionState?.options.length ?? 0) > 0 && (
                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {suggestionState?.options.map((suggestion, i) => (
                      <div
                        key={`${suggestion.label}-${i}`}
                        className="p-3 rounded-xl border bg-card hover:border-primary/40 transition-all flex flex-col justify-between gap-2.5 shadow-sm group"
                      >
                        <div>
                          <h5 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            {suggestion.label}
                          </h5>
                          {suggestion.description && (
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                              {suggestion.description}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2 pt-1 border-t border-border/40">
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleMakeIt(selectedFeature.id, suggestion)}
                          >
                            <Play className="w-3 h-3" />
                            Make It Now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-2.5"
                            onClick={() => {
                              addFeature(selectedFeature.id, {
                                name: suggestion.label,
                                description: suggestion.description,
                                status: "idea",
                              });
                            }}
                            title="Add node without triggering AI build immediately"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ==================== GRAPH NODE CONNECTED TREE COMPONENT ==================== */

interface GraphNodeTreeProps {
  feature: GameFeature;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GameFeature>) => void;
  onDelete: (id: string) => void;
  onAddChild: (id: string) => void;
  addingChildTo: string | null;
  newChildName: string;
  setNewChildName: (v: string) => void;
  onSubmitChild: (parentId: string) => void;
  onCancelChild: () => void;
  isRoot?: boolean;
}

function GraphNodeTree({
  feature,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAddChild,
  addingChildTo,
  newChildName,
  setNewChildName,
  onSubmitChild,
  onCancelChild,
  isRoot,
}: GraphNodeTreeProps) {
  const isSelected = selectedId === feature.id;
  const isAdding = addingChildTo === feature.id;

  const statusConfig = {
    idea: { label: "Idea", bg: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: Clock },
    "in-progress": { label: "Building", bg: "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse", icon: Loader2 },
    completed: { label: "Done", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: Check },
  };

  const currentStatus = statusConfig[feature.status] || statusConfig.idea;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="relative pl-4 space-y-4">
      {/* Node Box */}
      <div
        onClick={() => onSelect(feature.id)}
        className={cn(
          "cursor-pointer p-3.5 rounded-xl border transition-all relative group bg-card",
          isSelected
            ? "border-primary ring-2 ring-primary/20 shadow-md bg-primary/5"
            : "hover:border-border hover:bg-muted/30 border-border/80"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full border flex items-center gap-1", currentStatus.bg)}>
              <StatusIcon className="w-2.5 h-2.5" />
              {currentStatus.label}
            </span>
            {isRoot && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/15 text-amber-500 border border-amber-500/20 uppercase">
                Root System
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {feature.status !== "completed" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-emerald-500 hover:bg-emerald-500/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(feature.id, { status: "completed" });
                }}
              >
                <Check className="w-3 h-3 mr-0.5" /> Mark Done
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(feature.id);
              }}
              title="Add child node"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${feature.name}"?`)) onDelete(feature.id);
              }}
              title="Delete node"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <h4 className="font-semibold text-sm text-foreground mt-1.5">{feature.name}</h4>
        {feature.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{feature.description}</p>
        )}
      </div>

      {/* Adding custom child node input */}
      {isAdding && (
        <div className="ml-6 p-2 rounded-lg border bg-card flex items-center gap-2">
          <input
            autoFocus
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitChild(feature.id);
              if (e.key === "Escape") onCancelChild();
            }}
            placeholder="New child node title..."
            className="flex-1 px-2 py-1 text-xs rounded bg-background border outline-none"
          />
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => onSubmitChild(feature.id)}>
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onCancelChild}>
            Cancel
          </Button>
        </div>
      )}

      {/* Connected Children Lines & Nodes */}
      {feature.children.length > 0 && (
        <div className="relative pl-6 border-l-2 border-primary/20 space-y-4 ml-4">
          {feature.children.map((child) => (
            <GraphNodeTree
              key={child.id}
              feature={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              addingChildTo={addingChildTo}
              newChildName={newChildName}
              setNewChildName={setNewChildName}
              onSubmitChild={onSubmitChild}
              onCancelChild={onCancelChild}
              isRoot={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== TREE LIST ITEM COMPONENT ==================== */

interface TreeFeatureItemProps {
  feature: GameFeature;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GameFeature>) => void;
  onDelete: (id: string) => void;
  onAddChild: (id: string) => void;
  addingChildTo: string | null;
  newChildName: string;
  setNewChildName: (v: string) => void;
  onSubmitChild: (parentId: string) => void;
  onCancelChild: () => void;
  level: number;
}

function TreeFeatureItem({
  feature,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onAddChild,
  addingChildTo,
  newChildName,
  setNewChildName,
  onSubmitChild,
  onCancelChild,
  level,
}: TreeFeatureItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isAdding = addingChildTo === feature.id;

  return (
    <div className="space-y-1 group">
      <div
        onClick={() => onSelect(feature.id)}
        className={cn(
          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
          selectedId === feature.id ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${level * 16 + 10}px` }}
      >
        <div className="flex items-center gap-2 truncate">
          {feature.children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-0.5 hover:bg-muted rounded"
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-3" />
          )}
          <span className="truncate">{feature.name}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(feature.id);
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${feature.name}"?`)) onDelete(feature.id);
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {isAdding && (
        <div className="flex items-center gap-1.5 pl-8 pr-2">
          <input
            autoFocus
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            placeholder="Child feature name..."
            className="flex-1 px-2 py-1 text-xs rounded border bg-background"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitChild(feature.id);
              if (e.key === "Escape") onCancelChild();
            }}
          />
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => onSubmitChild(feature.id)}>
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancelChild}>
            Cancel
          </Button>
        </div>
      )}

      {expanded && feature.children.length > 0 && (
        <div>
          {feature.children.map((child) => (
            <TreeFeatureItem
              key={child.id}
              feature={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              addingChildTo={addingChildTo}
              newChildName={newChildName}
              setNewChildName={setNewChildName}
              onSubmitChild={onSubmitChild}
              onCancelChild={onCancelChild}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function flattenFeatures(features: GameFeature[]): GameFeature[] {
  const result: GameFeature[] = [];
  for (const f of features) {
    result.push(f);
    if (f.children.length > 0) {
      result.push(...flattenFeatures(f.children));
    }
  }
  return result;
}
