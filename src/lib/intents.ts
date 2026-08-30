export type IntentType =
  | "create"
  | "modify"
  | "delete"
  | "debug"
  | "explain"
  | "optimize"
  | "refactor"
  | "test"
  | "deploy"
  | "design"
  | "search"
  | "document"
  | "review"
  | "general";

export interface Intent {
  type: IntentType;
  confidence: number;
  suggestedPrompt?: string;
  relatedActions?: string[];
}

export interface SlashCommand {
  name: string;
  description: string;
  args?: {
    name: string;
    description: string;
    required?: boolean;
    default?: string;
  }[];
  examples?: string[];
}

export interface FollowUp {
  label: string;
  prompt: string;
  icon?: string;
  category?: IntentType;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "create",
    description: "Create a new Roblox element",
    args: [
      { name: "element", description: "Element type (npc, shop, weapon, gui, leaderboard, checkpoint)", required: true },
      { name: "name", description: "Name for the element", required: false },
    ],
    examples: ["/create npc", "/create shop GUI", "/create leaderboard"],
  },
  {
    name: "debug",
    description: "Debug an issue or error",
    args: [
      { name: "target", description: "What to debug (script, error, instance)", required: false },
    ],
    examples: ["/debug", "/debug error", "/debug script"],
  },
  {
    name: "explain",
    description: "Explain code or concept",
    args: [
      { name: "target", description: "What to explain", required: false },
    ],
    examples: ["/explain", "/explain this", "/explain DataStore"],
  },
  {
    name: "optimize",
    description: "Optimize performance",
    args: [
      { name: "target", description: "What to optimize", required: false },
    ],
    examples: ["/optimize", "/optimize script", "/optimize performance"],
  },
  {
    name: "test",
    description: "Test something in Studio",
    examples: ["/test", "/test code"],
  },
  {
    name: "refactor",
    description: "Refactor existing code",
    args: [
      { name: "target", description: "What to refactor", required: false },
    ],
    examples: ["/refactor", "/refactor script"],
  },
  {
    name: "document",
    description: "Generate documentation",
    examples: ["/document", "/document script"],
  },
  {
    name: "search",
    description: "Search for models or instances",
    args: [
      { name: "query", description: "Search query", required: true },
    ],
    examples: ["/search free model", "/search sword"],
  },
];

export const INTENT_PATTERNS: Record<IntentType, { patterns: RegExp[]; confidence: number }> = {
  create: {
    patterns: [
      /\bcreate\b/i,
      /\badd\b.*\bnew\b/i,
      /\bbuild\b.*\bnew\b/i,
      /\bmake\b.*\ba\b/i,
      /\bspawn\b/i,
      /\binstantiate\b/i,
    ],
    confidence: 0.85,
  },
  modify: {
    patterns: [
      /\bchange\b/i,
      /\bmodify\b/i,
      /\bupdate\b/i,
      /\bedit\b/i,
      /\bset\b.*\bto\b/i,
      /\badd\b(?!\s+\w+\s+to\b)/i,
      /\breplace\b/i,
    ],
    confidence: 0.8,
  },
  delete: {
    patterns: [
      /\bdelete\b/i,
      /\bremove\b(?!\s+all)/i,
      /\bdestroy\b/i,
      /\bcleanup\b/i,
    ],
    confidence: 0.9,
  },
  debug: {
    patterns: [
      /\bfix\b/i,
      /\bdebug\b/i,
      /\berror\b/i,
      /\bbroken\b/i,
      /\bnot working\b/i,
      /\bissue\b/i,
      /\bproblem\b/i,
      /\bwhy.*fail/i,
    ],
    confidence: 0.9,
  },
  explain: {
    patterns: [
      /\bexplain\b/i,
      /\bhow\b.*\bwork\b/i,
      /\bwhat\b.*\bdo\b/i,
      /\bunderstand\b/i,
      /\blearn\b/i,
      /\bdescribe\b/i,
      /\bwhat is\b/i,
    ],
    confidence: 0.85,
  },
  optimize: {
    patterns: [
      /\boptimize\b/i,
      /\bperformance\b/i,
      /\bfaster\b/i,
      /\befficient\b/i,
      /\blag\b/i,
      /\bslow\b/i,
    ],
    confidence: 0.85,
  },
  refactor: {
    patterns: [
      /\brefactor\b/i,
      /\bclean up\b/i,
      /\brestructure\b/i,
      /\brewrite\b/i,
    ],
    confidence: 0.85,
  },
  test: {
    patterns: [
      /\btest\b/i,
      /\btry\b.*\bout\b/i,
      /\bexperiment\b/i,
      /\brun\b.*\bcode\b/i,
    ],
    confidence: 0.8,
  },
  deploy: {
    patterns: [
      /\bdeploy\b/i,
      /\bpublish\b/i,
      /\brelease\b/i,
      /\bbuild\b(?!\s+\w+\s+new)/i,
    ],
    confidence: 0.85,
  },
  design: {
    patterns: [
      /\bdesign\b/i,
      /\blayout\b/i,
      /\bui\b/i,
      /\buix\b/i,
      /\bgui\b/i,
    ],
    confidence: 0.8,
  },
  search: {
    patterns: [
      /\bsearch\b/i,
      /\bfind\b(?!\s+\w+\s+in\b)/i,
      /\blook\s+up\b/i,
    ],
    confidence: 0.85,
  },
  document: {
    patterns: [
      /\bdocument\b/i,
      /\bcomment\b/i,
      /\bannotate\b/i,
    ],
    confidence: 0.8,
  },
  review: {
    patterns: [
      /\breview\b/i,
      /\baudit\b/i,
      /\bcheck\b.*\bfor\b/i,
    ],
    confidence: 0.8,
  },
  general: {
    patterns: [],
    confidence: 0.5,
  },
};

export const FOLLOW_UPS: Record<string, FollowUp[]> = {
  create: [
    { label: "Add properties", prompt: "Add properties like health, damage, or speed", category: "modify" },
    { label: "Add GUI", prompt: "Create a GUI for this", category: "create" },
    { label: "Test it", prompt: "Test this in Studio", category: "test" },
  ],
  modify: [
    { label: "Add features", prompt: "Add more features to this", category: "modify" },
    { label: "Test changes", prompt: "Test these changes", category: "test" },
    { label: "Explain", prompt: "Explain what changed", category: "explain" },
  ],
  delete: [
    { label: "Clean up related", prompt: "Clean up related instances", category: "modify" },
    { label: "Check references", prompt: "Check for broken references", category: "review" },
  ],
  debug: [
    { label: "Run in Studio", prompt: "Run this in Studio to test", category: "test" },
    { label: "Add error handling", prompt: "Add proper error handling", category: "modify" },
    { label: "Explain fix", prompt: "Explain what was fixed", category: "explain" },
  ],
  general: [
    { label: "Optimize", prompt: "Optimize this for performance", category: "modify" },
    { label: "Document", prompt: "Add documentation", category: "modify" },
    { label: "Test", prompt: "Test this in Studio", category: "test" },
  ],
};

export function detectIntent(message: string): Intent {
  const lowerMessage = message.toLowerCase().trim();

  let bestIntent: IntentType = "general";
  let highestConfidence = 0;

  for (const [intentType, config] of Object.entries(INTENT_PATTERNS)) {
    if (intentType === "general") continue;

    for (const pattern of config.patterns) {
      if (pattern.test(lowerMessage)) {
        if (config.confidence > highestConfidence) {
          highestConfidence = config.confidence;
          bestIntent = intentType as IntentType;
        }
        break;
      }
    }
  }

  return {
    type: bestIntent,
    confidence: highestConfidence,
    relatedActions: FOLLOW_UPS[bestIntent]?.map((f) => f.label) || FOLLOW_UPS.general.map((f) => f.label),
  };
}

export function parseSlashCommand(input: string): { command: SlashCommand; args: Record<string, string> } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0].toLowerCase();

  const command = SLASH_COMMANDS.find((c) => c.name === commandName);
  if (!command) return null;

  const args: Record<string, string> = {};
  const argDefs = command.args || [];

  argDefs.forEach((arg, index) => {
    const value = parts[index + 1];
    if (value) {
      args[arg.name] = value;
    } else if (arg.required && arg.default) {
      args[arg.name] = arg.default;
    }
  });

  return { command, args };
}

export function getFollowUps(intent: string): FollowUp[] {
  return FOLLOW_UPS[intent] || FOLLOW_UPS.general;
}

export function buildPromptFromSlash(command: SlashCommand, args: Record<string, string>): string {
  const argStrings = Object.entries(args)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

  return `/do ${command.name} ${argStrings}`.trim();
}
