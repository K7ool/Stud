/**
 * Conversation sidebar.
 *
 * Shows grouped conversations (Today / Yesterday / Previous 7 days / Older),
 * supports search, rename (double-click), archive, delete, and a "New Chat"
 * action. Designed to feel like a professional AI coding platform:
 *  - Compact, narrow, fits a 280px column
 *  - Active chat highlighted
 *  - Title auto-truncated; full title in tooltip
 *  - Context menu on hover for archive/delete
 *  - Search filters by title and message content
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Archive,
  Pencil,
  MessageSquare,
  Brain,
} from "lucide-react";
import { useChatStore, type ChatSession } from "@/stores/chat";
import { useMemoryStore } from "@/stores/memory";
import { groupConversations } from "@/lib/chat/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onOpenMemory?: () => void;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

function timeAgo(iso: string | number | undefined): string {
  if (!iso) return "";
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "now";
  if (diff < hour) return `${Math.floor(diff / min)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 2 * day) return "1d";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(t).toLocaleDateString();
}

function MessagePreview({ sessionId }: { sessionId: string }) {
  // Best-effort: read the last message from the chat store.
  const last = useChatStore((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    const m = sess?.messages[sess.messages.length - 1];
    return m?.content || "";
  });
  if (!last) return null;
  return (
    <div className="text-[11px] text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">
      {last.slice(0, 80)}
    </div>
  );
}

interface RowProps {
  session: ChatSession;
  active: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onSubmitEdit: (title: string) => void;
  onCancelEdit: () => void;
  onSwitch: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

function Row({
  session,
  active,
  editing,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onSwitch,
  onDelete,
  onArchive,
}: RowProps) {
  const [title, setTitle] = useState(session.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (editing) {
    return (
      <div className="px-2 py-1">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onSubmitEdit(title.trim() || session.title)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmitEdit(title.trim() || session.title);
            if (e.key === "Escape") onCancelEdit();
          }}
          className="h-7 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
        active ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground/90"
      )}
      onClick={onSwitch}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      <MessageSquare className={cn("w-3.5 h-3.5 mt-1 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium" title={session.title}>
            {session.title}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <span>{timeAgo(session.lastMessageAt || session.updatedAt)}</span>
          {session.status === "archived" && (
            <span className="text-[9px] uppercase tracking-wider opacity-70">archived</span>
          )}
        </div>
        <MessagePreview sessionId={session.id} />
      </div>
      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label="Conversation actions"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-md border bg-popover text-popover-foreground shadow-md p-1">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onStartEdit();
              }}
            >
              <Pencil className="w-3 h-3" /> Rename
            </button>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onArchive();
              }}
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-destructive/10 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ onOpenMemory, onClose, collapsed }: SidebarProps) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const archiveSession = useChatStore((s) => s.archiveSession);
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle);

  const memoryCount = useMemoryStore((s) => s.memories.length);

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Allow the parent (Home) to dismiss the sidebar after a navigation.
  const onPickChat = (id: string) => {
    switchSession(id);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", `/chat/${id}`);
    }
    setQuery("");
    onClose?.();
  };

  const onNewChat = () => {
    createSession();
    if (typeof window !== "undefined") {
      // Push a fresh /chat/:id route; the active id will be reflected by
      // the URL-sync effect in Home.
      window.history.pushState({}, "", "/");
    }
    setQuery("");
    onClose?.();
  };

  const groups = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const filtered = !lower
      ? sessions
      : sessions.filter((s) => {
          if (s.title.toLowerCase().includes(lower)) return true;
          return s.messages.some((m) => m.content?.toLowerCase().includes(lower));
        });
    return groupConversations(filtered);
  }, [sessions, query]);

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 border-r bg-background/50 flex flex-col items-center py-3 gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={() => createSession()}
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </Button>
        {onOpenMemory && (
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={onOpenMemory}
            title="Memory"
          >
            <Brain className="w-4 h-4" />
          </Button>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-r bg-background/50 flex flex-col h-full">
      <div className="p-3 border-b flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            className="flex-1 justify-start gap-2"
            variant="default"
            onClick={onNewChat}
          >
            <Plus className="w-4 h-4" /> New chat
          </Button>
          {onOpenMemory && (
            <Button
              size="icon"
              variant="ghost"
              className="relative"
              onClick={onOpenMemory}
              title={`Memory (${memoryCount})`}
            >
              <Brain className="w-4 h-4" />
              {memoryCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center">
                  {memoryCount > 99 ? "99+" : memoryCount}
                </span>
              )}
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="h-8 pl-7 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {sessions.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground px-3 py-8">
            No conversations yet. Start a new chat to begin.
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground px-3 py-8">
            No conversations match "{query}".
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((s) => (
                  <Row
                    key={s.id}
                    session={s}
                    active={s.id === currentSessionId}
                    editing={editingId === s.id}
                    onStartEdit={() => setEditingId(s.id)}
                    onSubmitEdit={(t) => {
                      updateSessionTitle(s.id, t);
                      setEditingId(null);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSwitch={() => onPickChat(s.id)}
                    onDelete={() => {
                      if (confirm(`Delete "${s.title}"? This cannot be undone.`)) {
                        deleteSession(s.id);
                      }
                    }}
                    onArchive={() => archiveSession(s.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
