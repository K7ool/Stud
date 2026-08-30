/**
 * StudioPairing - Generate a 6-character pairing code for the Roblox Studio plugin.
 *
 * Flow:
 *  1. User clicks "Connect Studio" → POST /api/pair/create → get code
 *  2. User pastes code into the Stud plugin's dock widget
 *  3. Plugin polls /api/studio/poll with that code → relay links it
 *  4. We poll /api/studio/status to detect when paired
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Copy, CheckCircle2, RefreshCw, X } from "lucide-react";
import {
  createPair,
  getPairCode,
  clearPair,
  checkPairStatus,
} from "@/lib/roblox/client";
import { useRobloxStore } from "@/stores/roblox";
import { cn } from "@/lib/utils";

type Status = "idle" | "generating" | "waiting" | "connected" | "error";

export function StudioPairing({ className }: { className?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [project, setProject] = useState<string | null>(null);
  const setStudioStatus = useRobloxStore((s) => s.setStatus);

  useEffect(() => {
    if (status === "connected") {
      setStudioStatus("connected");
    } else if (status === "waiting") {
      setStudioStatus("bridge_only");
    } else if (status === "idle" || status === "error") {
      setStudioStatus("disconnected");
    }
  }, [status, setStudioStatus]);

  useEffect(() => {
    const existing = getPairCode();
    if (existing) {
      setCode(existing);
      setStatus("waiting");
    }
  }, []);

  useEffect(() => {
    if (status !== "waiting" || !code) return;
    let cancelled = false;
    const tick = async () => {
      const s = await checkPairStatus(code);
      if (cancelled) return;
      if (s.connected) {
        setStatus("connected");
        setProject(s.project);
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, code]);

  const handleGenerate = async () => {
    setStatus("generating");
    setError(null);
    try {
      const { code: newCode } = await createPair();
      setCode(newCode);
      setStatus("waiting");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = () => {
    clearPair();
    setCode(null);
    setStatus("idle");
    setProject(null);
  };

  if (status === "connected") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Studio{project ? `: ${project}` : ""}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="h-6 px-2 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Unpair
        </Button>
      </div>
    );
  }

  if (status === "waiting" && code) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
          <Loader variant="circular" size="sm" />
          <span>Pairing: {code}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-6 w-6"
          title="Copy code"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGenerate}
          className="h-6 w-6"
          title="Generate new code"
          disabled={status === "generating"}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={status === "generating"}
        className="h-7 px-3 text-xs"
      >
        {status === "generating" ? (
          <>
            <Loader variant="circular" size="sm" />
            <span className="ml-1">Generating...</span>
          </>
        ) : (
          "Connect Studio"
        )}
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}