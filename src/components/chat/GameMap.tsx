import { useEffect, useState } from "react";
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
  ChevronRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader2,
  Trash2,
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

  const allFeatures = rootFeature
    ? [rootFeature, ...flattenFeatures(features)]
    : flattenFeatures(features);
  const selectedFeature = selectedFeatureId
    ? allFeatures.find((f) => f.id === selectedFeatureId) ?? null
    : null;
  const suggestionState = selectedFeatureId
    ? suggestions[selectedFeatureId]
    : undefined;

  // Fetch AI suggestions whenever the selected feature changes.
  useEffect(() => {
    if (!open || !selectedFeatureId) return;
    // Use the store directly to avoid stale closure over `suggestions`.
    useGameMapStore.getState().fetchSuggestions(selectedFeatureId);
  }, [open, selectedFeatureId]);

  const handleCreateFromSuggestion = (
    parentId: string,
    suggestion: FeatureSuggestion
  ) => {
    addFeature(parentId, {
      name: suggestion.label,
      description: suggestion.description,
      status: "idea",
    });
    // Clear cached suggestions for the parent so next click is fresh.
    clearSuggestions(parentId);
    // Prompt the AI to build the chosen child.
    const prompt = `Build "${suggestion.label}" (${suggestion.description}) as a child of the existing feature in the game map. Add it to the game map and implement it.`;
    onSelectSuggestion(prompt, suggestion.label);
    onOpenChange(false);
  };

  const handleCreateRootFromSuggestion = (suggestion: FeatureSuggestion) => {
    setRootFeature({
      name: suggestion.label,
      description: suggestion.description,
      status: "idea",
    });
    onSelectSuggestion(
      `Create "${suggestion.label}" (${suggestion.description}) as the root feature in the game map. Add it to the game map and implement it.`,
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Map className="w-5 h-5" />
            Game Map
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Feature Tree */}
          <div className="w-1/2 border rounded-lg p-4 overflow-y-auto">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Features
            </h3>

            {!rootFeature && features.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No features yet. Ask AI to create something, then it will appear here.
              </p>
            )}

            {rootFeature && (
              <div className="space-y-2">
                <FeatureItem
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
                  onCancelChild={() => {
                    setAddingChildTo(null);
                    setNewChildName("");
                  }}
                  level={0}
                />
              </div>
            )}

            {features.length > 0 && (
              <div className="mt-4 pt-4 border-t space-y-2">
                {features.map((feature) => (
                  <FeatureItem
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
                    onCancelChild={() => {
                      setAddingChildTo(null);
                      setNewChildName("");
                    }}
                    level={0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Suggestions Panel */}
          <div className="w-1/2 border rounded-lg p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                AI Suggestions
              </h3>
              {selectedFeatureId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Force a refetch.
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
                  className="h-7 px-2 text-xs"
                  title="Refresh suggestions"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              )}
            </div>

            {!selectedFeature ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a feature to see AI-generated suggestions
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Ideas for "{selectedFeature.name}"
                </p>

                {suggestionState?.loading && (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-full px-3 py-2 rounded-lg border text-sm animate-pulse"
                      >
                        <div className="h-3.5 bg-muted rounded w-2/3 mb-2" />
                        <div className="h-3 bg-muted rounded w-full" />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating suggestions…
                    </p>
                  </div>
                )}

                {!suggestionState?.loading && suggestionState?.error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-destructive font-medium">
                          Couldn't get suggestions
                        </p>
                        <p className="text-muted-foreground text-xs mt-1">
                          {suggestionState.error}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() =>
                            useGameMapStore.getState().fetchSuggestions(selectedFeature.id)
                          }
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {!suggestionState?.loading &&
                  !suggestionState?.error &&
                  (suggestionState?.options.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No suggestions yet. Click refresh to generate some.
                    </p>
                  )}

                {!suggestionState?.loading &&
                  (suggestionState?.options.length ?? 0) > 0 &&
                  suggestionState?.options.map((suggestion, i) => {
                    const parentId = selectedFeature.id;
                    return (
                      <button
                        key={`${suggestion.label}-${i}`}
                        onClick={() => handleCreateFromSuggestion(parentId, suggestion)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                          "hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20",
                          "flex flex-col gap-0.5"
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Plus className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          {suggestion.label}
                        </span>
                        {suggestion.description && (
                          <span className="text-xs text-muted-foreground pl-5.5 ml-[18px]">
                            {suggestion.description}
                          </span>
                        )}
                      </button>
                    );
                  })}

                {/* Quick option: when nothing exists yet, let the user bootstrap a root. */}
                {!rootFeature && features.length === 0 && (
                  <div className="pt-3 mt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">
                      Or bootstrap a root feature with one of the suggestions above.
                    </p>
                    {!suggestionState?.loading &&
                      (suggestionState?.options.length ?? 0) > 0 &&
                      suggestionState?.options.map((suggestion, i) => (
                        <button
                          key={`root-${i}`}
                          onClick={() => handleCreateRootFromSuggestion(suggestion)}
                          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1"
                        >
                          + Start project with "{suggestion.label}"
                        </button>
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

interface FeatureItemProps {
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

function FeatureItem({
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
}: FeatureItemProps) {
  const [expanded, setExpanded] = useState(true);
  const isAdding = addingChildTo === feature.id;

  const statusColors = {
    idea: "bg-muted text-muted-foreground",
    "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  };

  const statusIcons = {
    idea: <Clock className="w-3 h-3" />,
    "in-progress": <ChevronRight className="w-3 h-3" />,
    completed: <Check className="w-3 h-3" />,
  };

  return (
    <div className="space-y-1 group">
      <button
        onClick={() => onSelect(feature.id)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
          selectedId === feature.id && "bg-accent"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {feature.children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className={cn("shrink-0", statusColors[feature.status])}>
          {statusIcons[feature.status]}
        </span>
        <span className="truncate flex-1 text-left">{feature.name}</span>

        {feature.status === "idea" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(feature.id, { status: "in-progress" });
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded"
            title="Mark as in progress"
          >
            <ChevronRight className="w-3 h-3 text-blue-500" />
          </button>
        )}
        {feature.status === "in-progress" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(feature.id, { status: "completed" });
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-green-100 dark:hover:bg-green-900 rounded"
            title="Mark as completed"
          >
            <Check className="w-3 h-3 text-green-500" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(feature.id);
            setExpanded(true);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded"
          title="Add child feature"
        >
          <Plus className="w-3 h-3 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${feature.name}" and all its children?`)) {
              onDelete(feature.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded"
          title="Delete feature"
        >
          <Trash2 className="w-3 h-3 text-destructive" />
        </button>
      </button>

      {isAdding && (
        <div
          className="flex items-center gap-1.5"
          style={{ paddingLeft: `${level * 16 + 28}px` }}
        >
          <input
            autoFocus
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitChild(feature.id);
              if (e.key === "Escape") onCancelChild();
            }}
            placeholder="New feature name…"
            className="flex-1 px-2 py-1 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSubmitChild(feature.id)}
            disabled={!newChildName.trim()}
            className="h-7 px-2"
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelChild}
            className="h-7 px-2"
          >
            Cancel
          </Button>
        </div>
      )}

      {expanded && feature.children.length > 0 && (
        <div>
          {feature.children.map((child) => (
            <FeatureItem
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
