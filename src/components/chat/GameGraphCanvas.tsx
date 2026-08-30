import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { MechanicNode, MechanicEdge, MechanicStatus, MechanicCategory, RelationType } from "@/stores/gameMap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Scan,
  Loader2,
  Coins,
  Swords,
  Sparkles,
  Map as MapIcon,
  PawPrint,
  Scroll,
  Users,
  Layers,
  Box,
} from "lucide-react";

export const MECHANIC_STATUS_META: Record<MechanicStatus, { label: string; color: string; text: string; icon: string }> = {
  verified: { label: "Verified", color: "#16A34A", text: "text-emerald-500", icon: "✓" },
  implemented: { label: "Implemented", color: "#16A34A", text: "text-emerald-500", icon: "✓" },
  partial: { label: "Partial", color: "#F59E0B", text: "text-amber-500", icon: "◐" },
  discovered: { label: "Discovered", color: "#3B82F6", text: "text-blue-500", icon: "○" },
  planned: { label: "Planned", color: "#94A3B8", text: "text-slate-400", icon: "○" },
  error: { label: "Error", color: "#EF4444", text: "text-red-500", icon: "⚠" },
  missing: { label: "Missing", color: "#DC2626", text: "text-red-500", icon: "?" },
  unknown: { label: "Unknown", color: "#A3A3A3", text: "text-muted-foreground", icon: "?" },
};

export const CATEGORY_META: Record<MechanicCategory, { label: string; icon: any }> = {
  core: { label: "Core", icon: Box },
  economy: { label: "Economy", icon: Coins },
  progression: { label: "Progression", icon: Layers },
  collection: { label: "Collection", icon: PawPrint },
  combat: { label: "Combat", icon: Swords },
  quests: { label: "Quests", icon: Scroll },
  social: { label: "Social", icon: Users },
  ui: { label: "UI", icon: Sparkles },
  world: { label: "World", icon: MapIcon },
};

const RELATION_STYLE: Record<RelationType, { dashed: boolean; color: string; width: number }> = {
  depends_on: { dashed: false, color: "#A3A3A3", width: 2 },
  unlocks: { dashed: false, color: "#16A34A", width: 2.5 },
  uses: { dashed: false, color: "#94A3B8", width: 1.8 },
  produces: { dashed: false, color: "#F59E0B", width: 2 },
  modifies: { dashed: true, color: "#8B5CF6", width: 1.8 },
  triggers: { dashed: true, color: "#3B82F6", width: 1.5 },
  interacts_with: { dashed: false, color: "#A3A3A3", width: 1.6 },
  child_of: { dashed: false, color: "#94A3B8", width: 2 },
  related_to: { dashed: true, color: "#A3A3A3", width: 1.2 },
};

interface GameGraphCanvasProps {
  nodes: MechanicNode[];
  edges: MechanicEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScan?: () => void;
  scanning?: boolean;
  connected?: boolean;
  statusFilter?: MechanicStatus | "all" | null;
  categoryFilter?: MechanicCategory | "all" | null;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

const NODE_W = 168;
const NODE_H = 64;
const H_GAP = 260;
const V_GAP = 120;

function computeLayout(nodes: MechanicNode[], edges: MechanicEdge[]): Map<string, LayoutNode> {
  const pos = new Map<string, LayoutNode>();

  // Group by category to lay out columns.
  const byCategory: Record<string, MechanicNode[]> = {};
  for (const n of nodes) {
    (byCategory[n.category] ||= []).push(n);
  }
  const orderedCategories: MechanicCategory[] = ["core", "economy", "progression", "collection", "combat", "quests", "social", "ui", "world"];
  const present = orderedCategories.filter((c) => byCategory[c]?.length);

  const xPos = new Map<MechanicCategory, number>();
  present.forEach((cat, i) => {
    // Core centered-left; others spread across.
    const cx = i * (H_GAP + NODE_W);
    xPos.set(cat, cx);
  });

  for (const cat of present) {
    const list = byCategory[cat];
    const cx = xPos.get(cat)!;
    const spacing = Math.max(V_GAP, NODE_H + 40);
    list.forEach((n, i) => {
      const cy = i * spacing + 60;
      pos.set(n.id, { id: n.id, x: cx, y: cy });
    });
  }

  // Try to center the whole thing around origin by computing bounding box.
  const items = [...pos.values()];
  if (items.length > 0) {
    const minX = Math.min(...items.map((i) => i.x));
    const maxX = Math.max(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const maxY = Math.max(...items.map((i) => i.y));
    const offsetX = (minX + maxX) / 2;
    const offsetY = (minY + maxY) / 2;
    for (const p of pos.values()) {
      p.x -= offsetX;
      p.y -= offsetY;
    }
  }

  return pos;
}

export function GameGraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  onScan,
  scanning,
  connected,
  statusFilter,
  categoryFilter,
}: GameGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (statusFilter && statusFilter !== "all" && n.status !== statusFilter) return false;
      if (categoryFilter && categoryFilter !== "all" && n.category !== categoryFilter) return false;
      return true;
    });
  }, [nodes, statusFilter, categoryFilter]);

  const filteredIdSet = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(
    () => edges.filter((e) => filteredIdSet.has(e.source) && filteredIdSet.has(e.target)),
    [edges, filteredIdSet]
  );

  const layout = useMemo(() => {
    const l = computeLayout(filteredNodes, visibleEdges);
    // Apply stored positions where present.
    for (const n of nodes) {
      if (n.position && l.has(n.id)) {
        l.set(n.id, { ...l.get(n.id)!, x: n.position.x, y: n.position.y });
      }
    }
    return l;
  }, [filteredNodes, visibleEdges, nodes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setSize({ w: rect.width, h: rect.height });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(2.5, Math.max(0.3, z * factor)));
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragging && dragStart) {
      setPan({
        x: dragStart.panX + (e.clientX - dragStart.x),
        y: dragStart.panY + (e.clientY - dragStart.y),
      });
    }
  };

  const stopDrag = () => {
    if (dragging) setDragging(false);
    setDragStart(null);
  };

  const fitAll = useCallback(() => {
    // Zoom out to fit all nodes in view.
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
  }, []);

  const allNodes = nodes.length;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden rounded-xl border bg-[radial-gradient(circle,rgba(160,160,160,0.14)_1px,transparent_1px)] bg-[length:22px_22px] bg-muted/10 select-none"
      style={{ touchAction: "none" }}
      onWheel={handleWheel}
      onMouseDown={startDrag}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {/* Toolbar overlay */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between">
        <div className="flex items-center gap-1.5 rounded-lg border bg-background/90 backdrop-blur px-1.5 py-1 shadow-sm">
          <Button size="icon-xs" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[11px] font-mono px-1 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
          <Button size="icon-xs" variant="ghost" onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))} title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-4 bg-border" />
          <Button size="icon-xs" variant="ghost" onClick={fitAll} title="Fit to screen">
            <Maximize className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {!connected && (
            <span className="text-[10px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-500 bg-amber-500/5">
              Studio disconnected
            </span>
          )}
          {connected && (
            <span className="text-[10px] px-2 py-1 rounded-full border border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
              Studio connected
            </span>
          )}
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onScan}
            disabled={scanning || !connected}
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scan className="w-3.5 h-3.5" />}
            {scanning ? "Scanning..." : "Scan & Analyze"}
          </Button>
        </div>
      </div>

      {!connected && nodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center p-8 gap-2">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <MapIcon className="w-6 h-6" />
          </div>
          <div className="max-w-sm">
            <h4 className="font-medium text-sm">Connect Roblox Studio to analyze your game</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Once connected, click "Scan & Analyze" to build a real blueprint of your project's mechanics.
            </p>
          </div>
        </div>
      )}

      {(connected || nodes.length > 0) && filteredNodes.length === 0 && nodes.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-center p-6">
          <p className="text-xs text-muted-foreground">
            No nodes match the current filter. Clear filters to see all mechanics.
          </p>
        </div>
      )}

      <div
        className="absolute top-0 left-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        {/* Edges */}
        <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" width={size.w * 2} height={size.h * 2}>
          {visibleEdges.map((edge, i) => {
            const a = layout.get(edge.source);
            const b = layout.get(edge.target);
            if (!a || !b) return null;
            const style = RELATION_STYLE[edge.type] || RELATION_STYLE.related_to;
            const selected = selectedId === edge.source || selectedId === edge.target;
            const x1 = a.x + NODE_W / 2;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x + NODE_W / 2;
            const y2 = b.y + NODE_H / 2;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={selected ? style.color : style.color}
                  strokeWidth={style.width}
                  strokeOpacity={selectedId ? (selected ? 1 : 0.25) : 0.5}
                  strokeDasharray={style.dashed ? "6 4" : undefined}
                />
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill={selected ? style.color : "#A3A3A3"}
                  opacity={selectedId ? (selected ? 1 : 0.2) : 0.4}
                >
                  {edge.type.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {filteredNodes.map((node) => {
          const l = layout.get(node.id);
          if (!l) return null;
          const status = MECHANIC_STATUS_META[node.status];
          const CategoryIcon = CATEGORY_META[node.category]?.icon || Box;
          const isSelected = selectedId === node.id;
          return (
            <div
              key={node.id}
              data-node
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
              className={cn(
                "absolute rounded-xl border bg-card p-2.5 cursor-pointer transition-all",
                isSelected
                  ? "border-primary ring-2 ring-primary/25 shadow-lg"
                  : "border-border/80 hover:border-primary/40 hover:bg-muted/30"
              )}
              style={{
                left: l.x,
                top: l.y,
                width: NODE_W,
                minHeight: NODE_H,
                boxShadow: isSelected ? `0 0 0 4px rgba(0,0,0,0.03), 0 0 24px rgba(0,0,0,0.12)` : undefined,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-[10px]">
                  <CategoryIcon className="w-3 h-3" style={{ color: status.color }} />
                </span>
                <span className="text-[10px] font-semibold truncate flex-1">{node.name}</span>
                <span
                  className="text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold"
                  style={{ color: status.color, background: `${status.color}14` }}
                  title={status.label}
                >
                  {status.icon}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_META[node.category]?.label || node.category}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  {Math.round(node.confidence * 100)}%
                </span>
              </div>
              {node.progress > 0 && node.progress < 100 && (
                <div className="h-0.5 w-full bg-muted rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-primary/50 rounded-full"
                    style={{ width: `${node.progress}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allNodes > 0 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-background/80 border">{allNodes} mechanics</span>
          <span className="px-2 py-0.5 rounded-full bg-background/80 border">
            {allNodes - filteredNodes.length > 0 ? `${filteredNodes.length} shown` : "all shown"}
          </span>
        </div>
      )}
    </div>
  );
}
