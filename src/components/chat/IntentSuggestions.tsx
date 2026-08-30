import { useState, useEffect } from "react";
import { detectIntent, parseSlashCommand, getFollowUps, SLASH_COMMANDS, FollowUp, SlashCommand } from "@/lib/intents";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Plus,
  Search,
  FileText,
  Play,
  Box,
  Bug,
  Lightbulb,
  Zap,
  ChevronRight,
  Command,
} from "lucide-react";

interface IntentSuggestionsProps {
  input: string;
  onSelectSuggestion: (suggestion: string) => void;
  lastIntent?: string;
  disabled?: boolean;
}

const INTENT_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="h-3.5 w-3.5" />,
  modify: <Lightbulb className="h-3.5 w-3.5" />,
  delete: <Box className="h-3.5 w-3.5" />,
  debug: <Bug className="h-3.5 w-3.5" />,
  explain: <FileText className="h-3.5 w-3.5" />,
  optimize: <Zap className="h-3.5 w-3.5" />,
  refactor: <Sparkles className="h-3.5 w-3.5" />,
  test: <Play className="h-3.5 w-3.5" />,
  search: <Search className="h-3.5 w-3.5" />,
};

export function IntentSuggestions({
  input,
  onSelectSuggestion,
  lastIntent,
  disabled,
}: IntentSuggestionsProps) {
  const [detectedIntent, setDetectedIntent] = useState<ReturnType<typeof detectIntent> | null>(null);
  const [showSlashHelp, setShowSlashHelp] = useState(false);

  useEffect(() => {
    if (input.trim().length > 3) {
      const slashResult = parseSlashCommand(input);
      if (slashResult) {
        setDetectedIntent(null);
      } else {
        setDetectedIntent(detectIntent(input));
      }
    } else {
      setDetectedIntent(null);
    }
  }, [input]);

  const followUps = lastIntent ? getFollowUps(lastIntent) : [];

  const handleFollowUpClick = (followUp: FollowUp) => {
    onSelectSuggestion(followUp.prompt);
  };

  return (
    <div className="space-y-2">
      {/* Slash command hint */}
      {input.startsWith("/") && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Command className="h-3.5 w-3.5" />
          <span>Press Enter to execute slash command</span>
          <Popover open={showSlashHelp} onOpenChange={setShowSlashHelp}>
            <PopoverTrigger asChild>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                View all commands
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-3 border-b bg-muted/50">
                <h4 className="font-medium text-sm">Slash Commands</h4>
                <p className="text-xs text-muted-foreground">Type /command to quickly execute actions</p>
              </div>
              <div className="max-h-64 overflow-auto p-1">
                {SLASH_COMMANDS.map((cmd) => (
                  <SlashCommandItem
                    key={cmd.name}
                    command={cmd}
                    onSelect={(args) => {
                      const prompt = `/${cmd.name}${args ? ` ${args}` : ""}`;
                      onSelectSuggestion(prompt);
                      setShowSlashHelp(false);
                    }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Detected intent */}
      {detectedIntent && detectedIntent.type !== "general" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {INTENT_ICONS[detectedIntent.type]}
          <span className="capitalize">{detectedIntent.type}</span>
          <span className="text-muted">detected</span>
          <ChevronRight className="h-3 w-3" />
          <span className="capitalize">{detectedIntent.type} intent</span>
        </div>
      )}

      {/* Follow-up suggestions */}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Try next:</span>
          {followUps.map((followUp, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1 rounded-full"
              onClick={() => handleFollowUpClick(followUp)}
              disabled={disabled}
            >
              {followUp.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function SlashCommandItem({
  command,
  onSelect,
}: {
  command: SlashCommand;
  onSelect: (args?: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect()}
      className="w-full text-left px-3 py-2 hover:bg-accent rounded-md transition-colors"
    >
      <div className="flex items-center gap-2">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
          /{command.name}
        </code>
        <span className="text-sm">{command.description}</span>
      </div>
      {command.examples && (
        <div className="mt-1 text-xs text-muted-foreground">
          {command.examples.map((ex, i) => (
            <span key={i} className="mr-2">
              {ex}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
