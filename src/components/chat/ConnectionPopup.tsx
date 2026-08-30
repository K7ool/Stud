import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/stores/roblox";
import { RefreshCw, WifiOff, Loader2, X } from "lucide-react";

interface ConnectionPopupProps {
  open: boolean;
  status: ConnectionStatus;
  retrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Non-blocking popup shown when Roblox Studio is not connected while the user
 * is otherwise able to work. Provides a Retry button and a "hide this session"
 * dismiss option. It never fakes a connection - it reflects the real store status.
 */
export function ConnectionPopup({ open, status, retrying, onRetry, onDismiss }: ConnectionPopupProps) {
  const [wasDisconnected, setWasDisconnected] = useState(false);

  // Track transition to disconnected so we can re-pop once reconnected then lost again.
  useEffect(() => {
    if (open) setWasDisconnected(true);
    else if (status === "connected") setWasDisconnected(false);
  }, [open, status]);

  const shouldShow = open && status !== "connected";

  const statusLabel =
    status === "reconnecting"
      ? "Reconnecting to Roblox Studio..."
      : status === "bridge_only"
      ? "Bridge connected but Roblox Studio is not connected"
      : "Roblox Studio is not connected";

  return (
    <Dialog open={shouldShow} onOpenChange={() => onDismiss()}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              retrying || status === "reconnecting"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {retrying || status === "reconnecting" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base">{statusLabel}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              This will prevent AI tools from reading or editing your Roblox game.
              Connect Studio and retry to resume Studio features.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            disabled={retrying}
            className="gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Dismiss
          </Button>
          <Button
            size="sm"
            onClick={onRetry}
            disabled={retrying || status === "reconnecting"}
            className="gap-1.5"
          >
            {retrying || status === "reconnecting" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {retrying || status === "reconnecting" ? "Retrying..." : "Retry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
