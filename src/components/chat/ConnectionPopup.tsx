import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/stores/roblox";
import { useRobloxStore } from "@/stores/roblox";
import { getStudioSiteId } from "@/lib/roblox/client";
import { RefreshCw, WifiOff, Loader2, X, Download, AlertTriangle } from "lucide-react";

interface ConnectionPopupProps {
  open: boolean;
  status: ConnectionStatus;
  retrying: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Non-blocking popup shown when Roblox Studio is not connected. Distinguishes
 * the real cause (site mismatch, outdated plugin, old backend URL, bridge only)
 * using the server-side connection session — it never conflates "bridge is up"
 * with "Studio is connected".
 */
export function ConnectionPopup({ open, status, retrying, onRetry, onDismiss }: ConnectionPopupProps) {
  const [wasDisconnected, setWasDisconnected] = useState(false);
  const diagnostics = useRobloxStore((s) => s.diagnostics);

  // Track transition to disconnected so we can re-pop once reconnected then lost again.
  useEffect(() => {
    if (open) setWasDisconnected(true);
    else if (status === "connected") setWasDisconnected(false);
  }, [open, status]);

  const shouldShow = open && status !== "connected";

  const statusLabel =
    status === "reconnecting"
      ? "Reconnecting to Roblox Studio..."
      : status === "mismatch"
      ? "Studio site mismatch detected"
      : status === "outdated"
      ? "Your Roblox Studio plugin is outdated"
      : status === "old_backend"
      ? "Your plugin points to an outdated backend"
      : status === "relay_unbacked"
      ? "Relay is missing a shared store"
      : status === "bridge_only"
      ? "Bridge connected but Roblox Studio is not connected"
      : "Roblox Studio is not connected";

  const isProblemState =
    status === "mismatch" ||
    status === "outdated" ||
    status === "old_backend" ||
    status === "relay_unbacked";

  return (
    <Dialog open={shouldShow} onOpenChange={() => onDismiss()}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              retrying || status === "reconnecting"
                ? "bg-amber-500/10 text-amber-500"
                : isProblemState
                ? "bg-amber-500/10 text-amber-500"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {retrying || status === "reconnecting" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isProblemState ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <WifiOff className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base">{statusLabel}</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              This will prevent AI tools from reading or editing your Roblox game.
            </p>
          </div>
        </div>

        {shouldShow && status === "outdated" && (
          <div className="flex items-start gap-2.5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <p className="font-semibold mb-0.5">Plugin configuration is outdated</p>
              <p>
                Your installed plugin (v
                {diagnostics?.session?.pluginVersion || "unknown"}) is older than the
                minimum supported version (v{diagnostics?.minPluginVersion || "?"}).
                Download the latest plugin below, then restart Studio.
              </p>
            </div>
          </div>
        )}

        {shouldShow && status === "old_backend" && (
          <div className="flex items-start gap-2.5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <p className="font-semibold mb-0.5">Plugin is pointing at an old backend</p>
              <p>
                Plugin backend:{" "}
                <code className="break-all">{diagnostics?.session?.baseUrl || "?"}</code>
                <br />
                Current backend:{" "}
                <code className="break-all">{diagnostics?.serverBase || "?"}</code>
                <br />
                Re-download the plugin to repoint it at this deployment.
              </p>
            </div>
          </div>
        )}

        {shouldShow && status === "mismatch" && (
          <div className="flex items-start gap-2.5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <p className="font-semibold mb-0.5">
                Likely cause: site mismatch
              </p>
              <p>
                Your plugin connects to a different site ID than this browser.
                Current browser site ID:{" "}
                <code className="select-all">{getStudioSiteId()}</code>
                {diagnostics?.session?.baseUrl ? (
                  <>
                    <br />
                    Plugin site ID:{" "}
                    <code className="select-all">{diagnostics.site}</code>
                  </>
                ) : null}
                <br />
                Re-download the plugin to rematch, then restart Studio.
              </p>
            </div>
          </div>
        )}

        {shouldShow && status === "relay_unbacked" && (
          <div className="flex items-start gap-2.5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <p className="font-semibold mb-0.5">The relay needs a shared store</p>
              <p>
                Commands and results are stored per-server-instance because Upstash
                Redis is not configured. On Vercel, requests can hit different
                instances, so commands never reach Studio even though the plugin
                looks connected.
                <br />
                <br />
                Add a free Upstash Redis database to this Vercel project and set{" "}
                <code className="break-all">KV_REST_API_URL</code> and{" "}
                <code className="break-all">KV_REST_API_TOKEN</code>, then redeploy.
              </p>
            </div>
          </div>
        )}

        {shouldShow && status === "bridge_only" && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            The bridge is available but no plugin is connected to this site (
            <code className="select-all">{getStudioSiteId()}</code>). Install or
            re-install the plugin below, then restart Studio.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `/api/stud/plugin?site=${getStudioSiteId()}`;
              const a = document.createElement("a");
              a.href = url;
              a.download = "stud-bridge.server.lua";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {isProblemState ? "Download updated plugin" : "Download plugin"}
          </Button>
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
