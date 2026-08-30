import { useEffect, useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import {
  useGameMapStore,
  GameFeature,
  FeatureSuggestion,
  type MechanicNode,
  type MechanicStatus,
  type MechanicCategory,
} from "@/stores/gameMap";
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
  Network,
  Box,
  FileCode2,
  Zap,
  User,
  X,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from "lucide-react";
import {
  GameGraphCanvas,
  MECHANIC_STATUS_META,
  CATEGORY_META,
} from "@/components/chat/GameGraphCanvas";
import { useRobloxStore } from "@/stores/roblox";

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
    nodes,
    edges,
    projectName,
    disconnected: storeDisconnected,
    analysisRunning,
    analysisStage,
    scanConnectedProject,
    updateMechanic,
    setNodeStatus,
  } = useGameMapStore();
  const studioConnected = useRobloxStore((s) => s.status === "connected");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedMechanicId, setSelectedMechanicId] = useState<string | null>(null);
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [viewMode, setViewMode] = useState<"graph" | "mechanics" | "tree">("graph");
  const [statusFilter, setStatusFilter] = useState<MechanicStatus | "all" | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<MechanicCategory | "all" | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input so we don't recompute/layout the graph per keystroke.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchQuery(searchInput), 200);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!open || viewMode !== "mechanics") return;
    useGameMapStore.getState().resetAnalysisState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync disconnected state whenever connection changes.
  useEffect(() => {
    useGameMapStore.setState({ disconnected: !studioConnected });
  }, [studioConnected, open]);

  const selectedMechanic = selectedMechanicId
    ? nodes.find((n) => n.id === selectedMechanicId) ?? null
    : null;

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

  const handleScan = () => {
    void scanConnectedProject();
  };

  const mechanicCounts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const n of nodes) {
      byStatus[n.status] = (byStatus[n.status] || 0) + 1;
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    return { byStatus, byCategory };
  }, [nodes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-[94vw] h-[90vh] max-w-[1400px] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b px-4 py-3 flex flex-row items-center justify-between gap-4">
          {/* Left: title + subtitle */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
              <Map className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                Game Map
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground truncate">
                Visualize your game's systems and dependencies
              </p>
            </div>
          </div>

          {/* Center: compact connection status */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border bg-muted/40">
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  studioConnected ? "bg-emerald-500" : "bg-muted-foreground"
                )}
              />
              <span className={studioConnected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {studioConnected ? "Connected" : "Disconnected"}
              </span>
            </span>
            {projectName && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[180px] font-mono">
                {projectName}
              </span>
            )}
          </div>

          {/* Right: view mode tabs + close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Toggle — subtle segmented tabs */}
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg">
              <button
                onClick={() => setViewMode("graph")}
                className={cn(
                  "px-2.5 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  viewMode === "graph"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Connected Map</span>
              </button>
              <button
                onClick={() => setViewMode("mechanics")}
                title="Real project mechanics graph (requires Studio)"
                className={cn(
                  "px-2.5 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  viewMode === "mechanics"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Network className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Mechanics</span>
                {nodes.length > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                    {nodes.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setViewMode("tree")}
                className={cn(
                  "px-2.5 h-7 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  viewMode === "tree"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Hierarchy</span>
              </button>
            </div>

            <div className="w-px h-5 bg-border mx-1" />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              title="Close game map"
              aria-label="Close game map"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Mechanics Canvas View (rich graph from real scan data) */}
          {viewMode === "mechanics" ? (
            <div className="flex flex-1 min-h-0">
              {/* LEFT: Filter control panel (collapsible) */}
              <div
                className={cn(
                  "shrink-0 border-r bg-muted/20 h-full transition-all duration-200 overflow-hidden",
                  sidebarCollapsed ? "w-0 border-r-0" : "w-[240px]"
                )}
              >
                <div className="flex flex-col h-full min-h-0" style={{ width: 240 }}>
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                    <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <SlidersHorizontal className="w-3 h-3" />
                      Filters
                    </label>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                      title="Collapse filters"
                      aria-label="Collapse filters"
                    >
                      <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Search */}
                  <div className="px-3 pb-2.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search mechanics..."
                        className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border bg-background outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                      />
                      {searchInput && (
                        <button
                          onClick={() => setSearchInput("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Status filter */}
                  {nodes.length > 0 && (
                    <div className="flex flex-col gap-1 px-3 pb-3 overflow-y-auto">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Status</span>
                      <div className="flex flex-col gap-1">
                        <FilterRowChip
                          active={statusFilter === null}
                          label="All Statuses"
                          count={nodes.length}
                          dotColor="#A3A3A3"
                          onClick={() => setStatusFilter(null)}
                        />
                        {(Object.keys(MECHANIC_STATUS_META) as MechanicStatus[])
                          .filter((k) => mechanicCounts.byStatus[k] > 0)
                          .map((k) => (
                            <FilterRowChip
                              key={k}
                              active={statusFilter === k}
                              label={MECHANIC_STATUS_META[k].label}
                              count={mechanicCounts.byStatus[k]}
                              dotColor={MECHANIC_STATUS_META[k].color}
                              onClick={() => setStatusFilter(statusFilter === k ? null : k)}
                            />
                          ))}
                      </div>

                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 mt-3">Category</span>
                      <div className="flex flex-col gap-1">
                        {(Object.keys(CATEGORY_META) as MechanicCategory[])
                          .filter((k) => mechanicCounts.byCategory[k] > 0)
                          .map((k) => {
                            const Icon = CATEGORY_META[k].icon;
                            return (
                              <FilterRowChip
                                key={k}
                                active={categoryFilter === k}
                                label={CATEGORY_META[k].label}
                                count={mechanicCounts.byCategory[k]}
                                dotColor="#A3A3A3"
                                icon={<Icon className="w-3 h-3" />}
                                onClick={() => setCategoryFilter(categoryFilter === k ? null : k)}
                              />
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar collapse trigger (when collapsed) */}
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="shrink-0 w-7 self-stretch flex items-center justify-center border-r text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  title="Show filters"
                  aria-label="Show filters"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
              )}

              {/* CENTER: Graph (dominant) */}
              <div className="flex-1 flex flex-col gap-2 min-w-0 p-3">
                {analysisRunning && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span className="capitalize">{analysisStage ?? "analyzing"}…</span>
                  </div>
                )}

                <GameGraphCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedId={selectedMechanicId}
                  onSelect={setSelectedMechanicId}
                  onScan={handleScan}
                  scanning={analysisRunning}
                  connected={studioConnected}
                  statusFilter={statusFilter}
                  categoryFilter={categoryFilter}
                  searchQuery={searchQuery}
                />
              </div>

              {/* RIGHT: Details panel (collapsible) */}
              {detailsCollapsed ? (
                <button
                  onClick={() => setDetailsCollapsed(false)}
                  className="shrink-0 self-stretch w-7 flex items-center justify-center border-l text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  title="Show details"
                  aria-label="Show details"
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="shrink-0 w-[320px] border-l bg-card h-full flex min-h-0">
                  <button
                    onClick={() => setDetailsCollapsed(true)}
                    className="shrink-0 w-6 self-stretch flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                    title="Collapse details"
                    aria-label="Collapse details"
                  >
                    <PanelRightClose className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 min-w-0 overflow-y-auto">
                    {selectedMechanic ? (
                      <MechanicDetailPanel
                        node={selectedMechanic}
                        onStatusChange={(s, p) => setNodeStatus(selectedMechanic.id, s, p)}
                        onClose={() => setSelectedMechanicId(null)}
                        onSelectNode={setSelectedMechanicId}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center px-3 py-8 gap-1.5 h-full">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                          <Network className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">Select a mechanic</p>
                        <p className="text-[10px] text-muted-foreground/70 max-w-[200px] leading-relaxed">
                          Inspect evidence, dependencies, related Roblox instances, and scripts.
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">
                          {nodes.length === 0
                            ? `Connect Studio then scan to build a real blueprint.`
                            : `${nodes.length} mechanics • ${edges.length} relations`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="flex flex-1 gap-4 p-3 min-h-0">
          {/* Main Visual Connected Canvas / Tree */}
          <div className="flex-[7] min-w-0 border rounded-xl p-4 overflow-y-auto bg-muted/10 relative flex flex-col">
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
          <div className="flex-[5] min-w-0 border rounded-xl p-4 overflow-y-auto bg-card flex flex-col">
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ==================== MECHANICS VIEW SUB-COMPONENTS ==================== */

interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  dotColor?: string;
  onClick: () => void;
}

function FilterChip({ label, active, count, dotColor, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border transition-colors",
        active
          ? "bg-primary/15 border-primary/40 text-primary font-medium"
          : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60"
      )}
    >
      {dotColor && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
      )}
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="text-[9px] font-mono text-muted-foreground/70">{count}</span>
      )}
    </button>
  );
}

interface FilterRowChipProps {
  label: string;
  active: boolean;
  count?: number;
  dotColor?: string;
  icon?: ReactNode;
  onClick: () => void;
}

function FilterRowChip({ label, active, count, dotColor, icon, onClick }: FilterRowChipProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors text-left",
        active
          ? "bg-primary/10 border-primary/30 text-foreground"
          : "bg-background border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      {icon ? (
        <span className="text-muted-foreground">{icon}</span>
      ) : dotColor ? (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
      ) : null}
      <span className="truncate flex-1">{label}</span>
      {typeof count === "number" && (
        <span className="text-[10px] font-mono text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

interface MechanicDetailPanelProps {
  node: MechanicNode;
  onStatusChange: (status: MechanicStatus, progress?: number) => void;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

function MechanicDetailPanel({ node, onStatusChange, onClose, onSelectNode }: MechanicDetailPanelProps) {
  const status = MECHANIC_STATUS_META[node.status];
  const CategoryIcon = CATEGORY_META[node.category]?.icon || Box;
  const deps = node.dependencies.map((d) => useGameMapStore.getState().nodes.find((n) => n.id === d)).filter(Boolean) as MechanicNode[];
  const dependents = node.dependents.map((d) => useGameMapStore.getState().nodes.find((n) => n.id === d)).filter(Boolean) as MechanicNode[];

  const progressOptions: { label: string; value: number }[] = [
    { label: "Idea", value: 0 },
    { label: "Planned", value: 20 },
    { label: "In progress", value: 50 },
    { label: "Almost done", value: 80 },
    { label: "Complete", value: 100 },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center">
            <CategoryIcon className="w-3.5 h-3.5 text-primary" />
          </span>
          <h3 className="text-sm font-semibold">{node.name}</h3>
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} title="Close">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4 min-h-0 overflow-y-auto">
        <div className="space-y-2">
          <StatusBadge status={node.status} />
          <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Confidence {Math.round(node.confidence * 100)}%
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {node.source === "roblox_studio" ? "From Studio" : node.source === "ai" ? "AI generated" : node.source}
            </span>
          </div>
        </div>

        {/* Progress selector */}
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Progress</span>
          <div className="flex flex-wrap gap-1.5">
            {progressOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onStatusChange(node.status, opt.value)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] border transition-colors",
                  (node.progress >= opt.value && node.progress < opt.value + 21) || (opt.value === 100 && node.progress === 100)
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${node.progress}%` }} />
          </div>
        </div>

        {/* Dependencies */}
        <Section heading="Depends on" icon={GitFork}>
          {deps.length > 0 ? (
            <div className="space-y-1">
              {deps.map((d) => (
                <LinkRow key={d.id} id={d.id} name={d.name} status={d.status} onSelect={onSelectNode} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">No dependencies.</p>
          )}
        </Section>

        {/* Dependents */}
        <Section heading="Used by" icon={Network}>
          {dependents.length > 0 ? (
            <div className="space-y-1">
              {dependents.map((d) => (
                <LinkRow key={d.id} id={d.id} name={d.name} status={d.status} onSelect={onSelectNode} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">Nothing depends on this yet.</p>
          )}
        </Section>

        {/* Real evidence */}
        <Section heading="Evidence in project" icon={FileCode2}>
          <div className="space-y-2">
            {node.instances.length > 0 && (
              <EvidenceList label="Instances" paths={node.instances} />
            )}
            {node.scripts.length > 0 && (
              <EvidenceList label="Scripts" paths={node.scripts} />
            )}
            {node.remoteEvents.length > 0 && (
              <EvidenceList label="RemoteEvents/Functions" paths={node.remoteEvents} />
            )}
            {node.guis.length > 0 && (
              <EvidenceList label="GUIs" paths={node.guis} />
            )}
            {node.evidence.length > 0 && (
              <EvidenceList
                label="Detected signals"
                paths={node.evidence.map((e) => e.path)}
              />
            )}
            {node.instances.length === 0 &&
              node.scripts.length === 0 &&
              node.remoteEvents.length === 0 &&
              node.guis.length === 0 &&
              node.evidence.length === 0 && (
                <p className="text-[11px] text-muted-foreground/70">
                  No project evidence yet. Connect Studio and scan to detect real instances.
                </p>
              )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MechanicStatus }) {
  const meta = MECHANIC_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
      style={{ color: meta.color, background: `${meta.color}14`, borderColor: `${meta.color}33` }}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function Section({ heading, icon: Icon, children }: { heading: string; icon: any; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" />
        {heading}
      </span>
      {children}
    </div>
  );
}

function LinkRow({ id, name, status, onSelect }: { id: string; name: string; status: MechanicStatus; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="w-full flex items-center justify-between px-2 py-1 rounded-md border border-border/60 bg-muted/20 text-left hover:bg-muted/40 text-xs"
    >
      <span className="truncate">{name}</span>
      <span className="text-[9px] text-muted-foreground">{MECHANIC_STATUS_META[status]?.icon} {MECHANIC_STATUS_META[status]?.label}</span>
    </button>
  );
}

function EvidenceList({ label, paths }: { label: string; paths: string[] }) {
  const shown = paths.slice(0, 12);
  const hidden = paths.length - shown.length;
  return (
    <div>
      <span className="text-[10px] font-semibold text-muted-foreground">{label} ({paths.length})</span>
      <div className="mt-1 space-y-0.5">
        {shown.map((p, i) => (
          <div key={i} className="truncate text-[10px] font-mono text-muted-foreground/90 pl-1 border-l-2 border-border/50">
            {p}
          </div>
        ))}
        {hidden > 0 && (
          <div className="text-[10px] text-muted-foreground/60 pl-1">+{hidden} more</div>
        )}
      </div>
    </div>
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
