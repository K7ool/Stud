import { useState } from "react";
import { useGameMapStore, GameFeature } from "@/stores/gameMap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import { Map, Plus, Check, Clock, Lightbulb, X, ChevronRight, Sparkles } from "lucide-react";

interface GameMapProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSuggestion: (suggestion: string) => void;
}

export function GameMap({ open, onOpenChange, onSelectSuggestion }: GameMapProps) {
  const { rootFeature, features, getSuggestions, updateFeature, addFeature, setRootFeature } = useGameMapStore();
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  const allFeatures = rootFeature ? [rootFeature, ...flattenFeatures(features)] : flattenFeatures(features);
  const selectedFeature = selectedFeatureId ? allFeatures.find(f => f.id === selectedFeatureId) : null;
  const suggestions = selectedFeatureId ? getSuggestions(selectedFeatureId) : [];

  const handleCreateFromSuggestion = (suggestion: string) => {
    const parentId = selectedFeatureId || rootFeature?.id || null;
    const featureName = suggestion.replace(/^(make|add|create|build)/i, "").trim();
    
    if (parentId) {
      addFeature(parentId, {
        name: featureName,
        description: `Generated from: ${suggestion}`,
        status: "idea",
      });
    } else if (!rootFeature) {
      setRootFeature({
        name: featureName,
        description: `Game feature: ${suggestion}`,
        status: "idea",
      });
    }
    onSelectSuggestion(suggestion);
    onOpenChange(false);
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
                    level={0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Suggestions Panel */}
          <div className="w-1/2 border rounded-lg p-4 overflow-y-auto">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Suggestions
            </h3>

            {!selectedFeature ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a feature to see suggestions
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Ideas for "{selectedFeature.name}"
                </p>
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleCreateFromSuggestion(suggestion)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "flex items-center gap-2"
                    )}
                  >
                    <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span>{suggestion}</span>
                  </button>
                ))}
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
  level: number;
}

function FeatureItem({ feature, selectedId, onSelect, onUpdate, level }: FeatureItemProps) {
  const [expanded, setExpanded] = useState(true);

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
    <div className="space-y-1">
      <button
        onClick={() => onSelect(feature.id)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
          selectedId === feature.id && "bg-accent"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {feature.children.length > 0 && (
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
        )}
        {feature.children.length === 0 && <span className="w-4" />}

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
      </button>

      {expanded && feature.children.length > 0 && (
        <div>
          {feature.children.map((child) => (
            <FeatureItem
              key={child.id}
              feature={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onUpdate={onUpdate}
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
