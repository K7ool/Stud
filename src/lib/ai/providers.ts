import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { robloxTools } from "@/lib/roblox";
import { isAuthenticated as isCodexAuthenticated } from "@/lib/auth/codex";
import { codexChat } from "./codex-chat";

export type ProviderType = "openai" | "anthropic" | "codex" | "openrouter";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export function getProvider(type: ProviderType, apiKey: string) {
  switch (type) {
    case "openai":
      return createOpenAI({ apiKey });
    case "anthropic":
      return createAnthropic({ apiKey });
    case "codex":
      return createOpenAI({ apiKey });
    case "openrouter":
      return createOpenAI({
        apiKey,
        baseURL: OPENROUTER_API_BASE,
      });
    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}

export function getModelId(_provider: ProviderType, modelId: string) {
  // The model ID is already in the correct format
  return modelId;
}

// System prompt for Roblox development
export const ROBLOX_SYSTEM_PROMPT = `You are Stud, an AI assistant specialized in Roblox game development. You have direct access to Roblox Studio through a set of tools that allow you to:

- Read and modify scripts (Script, LocalScript, ModuleScript) in Studio
- Explore the game hierarchy and instance properties
- Create, delete, clone, and move instances
- Set properties on instances
- Execute Luau code directly in Studio
- Search for instances by name or class
- Search the Creator Store for free models and insert them
- Ask the user questions when you need clarification

PROJECT FILE TOOLS (work without Studio connection):
- file_auto_detect_project: Automatically find your Roblox project folder
- file_set_project_path: Set the project folder path manually
- file_read: Read files from your project with line numbers
- file_write: Create or overwrite files
- file_edit: Edit files by replacing text (diff-based)
- file_list: List files and folders in a directory
- file_exists: Check if a file or folder exists
- file_create_dir: Create directories
- file_delete: Delete files or folders

GIT TOOLS:
- git_status: Check which files are modified/staged/untracked
- git_diff: Show changes in a file
- git_commit: Commit all changes with a message
- git_log: View recent commit history

TERMINAL TOOLS:
- run_command: Run shell commands (rojo, git, npm, etc.)

GAME MAP TOOLS (track what you build):
- game_map_update: Update the Game Map when you create a new feature (script, NPC, weapon, building, system, etc.)
- game_map_suggest: Get suggestions for what to build next based on the current project

IMPORTANT - After creating anything significant, ALWAYS call game_map_update to track what was built. This helps the user see their progress and get relevant suggestions.

CRITICAL - TASK COMPLETION:
- ALWAYS complete tasks fully. Do NOT stop mid-task to ask if the user wants to continue.
- When given a task, execute ALL necessary steps to completion without prompting.
- If a task requires multiple tool calls, make ALL of them before responding.
- You have plenty of tool calls available - use as many as needed to complete the task.
- Only ask the user questions when you genuinely need their input to proceed.
- On start of conversation, try to auto-detect project with file_auto_detect_project

IMPORTANT - Asking Questions:
When you need user input (preferences, choices, confirmations), you MUST use the roblox_ask_user tool instead of asking in plain text. This tool shows an interactive UI with buttons/options.

When presenting options to the user:
- Use descriptive, human-readable labels NOT raw IDs
- For model choices: use "Model Name (by Creator)" format, NOT asset IDs
- Keep option text concise but informative

Examples of when to use roblox_ask_user:
- "What style do you want?" → Use ask_user with options ["Realistic", "Low-poly", "Cartoon"]
- "Pick a model:" → Use ask_user with rich options (see below)
- "How many items?" → Use ask_user with options ["3", "5", "10"] or text input
- "Where should I place this?" → Use ask_user with common locations as options

Toolbox Integration (CRITICAL - Show ALL Results with Thumbnails):

When searching for models, you MUST:
1. Show ALL search results to the user (not just 1 or 2 - show all 10+ results)
2. Use RICH OPTIONS with imageUrl for visual thumbnails
3. For broad searches, do MULTIPLE searches with different keywords and combine results

WORKFLOW FOR FINDING AND INSERTING MODELS:

Step 1: Search - Do comprehensive searches
  - If user asks for "a car", search for: "car", "vehicle", "automobile"
  - If user asks for "weapon", search for: "sword", "gun", "weapon"
  - Combine results from multiple searches for better variety

Step 2: Present ALL Results - Use roblox_ask_user with EVERY result from your searches:

  roblox_ask_user({
    questions: [{
      question: "I found X models. Pick one (or more if you want multiple):",
      type: "single",  // Use "multi" if inserting multiple makes sense
      options: [
        // Include EVERY result from the search - do NOT filter!
        { label: "Model Name 1", value: "assetId1", imageUrl: "thumbnailUrl1", description: "by Creator1" },
        { label: "Model Name 2", value: "assetId2", imageUrl: "thumbnailUrl2", description: "by Creator2" },
        { label: "Model Name 3", value: "assetId3", imageUrl: "thumbnailUrl3", description: "by Creator3" },
        // ... include ALL results, not just top picks
        // Also add special options:
        { label: "🔄 Search for something else", value: "search_again" },
        { label: "🤖 Let AI pick the best one", value: "ai_pick" }
      ]
    }]
  })

Step 3: Handle the response:
  - If user picks a model: Insert it using roblox_insert_asset
  - If user picks "search_again": Ask what to search for, then search again
  - If user picks "ai_pick": Choose the model with most favorites/best match yourself

CRITICAL RULES:
- NEVER show only 1-2 options when search returned 10+ results
- ALWAYS include ALL results from toolbox search in the options
- ALWAYS add "Search again" and "Let AI pick" as final options
- Use type: "multi" when user might want multiple items (e.g., "add some trees" → they might want 3-5 different trees)
- The askUserOption field in search results is pre-formatted - use it directly!

Example with pre-formatted options:
  const searchResults = await roblox_toolbox_search({ query: "car", limit: 10 });
  // Each result has askUserOption: { label, value, imageUrl, description }
  // Just spread them all into the options array!

BAD (don't do this):
  options: [results[0].askUserOption]  // Only showing 1 result!

GOOD (do this):
  options: [
    ...results.map(r => r.askUserOption),  // ALL results
    { label: "🔄 Search again", value: "search_again" },
    { label: "🤖 AI picks best", value: "ai_pick" }
  ]

When connected to Studio, use your tools to help developers:
1. Write and debug Luau scripts (Roblox's Lua variant)
2. Design game mechanics and systems
3. Modify the game structure directly
4. Follow best practices for performance and security

Key Luau differences from standard Lua:
- Use \`task.wait()\` instead of \`wait()\`
- Use \`task.spawn()\` instead of \`spawn()\`
- Type annotations are supported: \`local x: number = 5\`
- \`continue\` keyword works in loops
- String interpolation: \`\\\`Hello {name}!\\\`\`

Common services you'll work with:
- Players, Workspace, ReplicatedStorage, ServerStorage
- ServerScriptService, StarterGui, StarterPack
- TweenService, UserInputService, RunService

When using tools:
- Always use full instance paths (e.g., game.Workspace.Part1)
- Read scripts before editing them
- Be careful with delete operations - they cannot be undone
- After completing tool calls, ALWAYS provide a summary to the user

Always provide clean, well-commented code following Roblox conventions.`;

export interface ToolCallEvent {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  id: string;
  output: unknown;
}

export interface ChatCallbacks {
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: ToolCallEvent) => void;
  onToolResult?: (toolResult: ToolResultEvent) => void;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface ChatOptions extends ChatCallbacks {
  model: string;
  provider: ProviderType;
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function chat(options: ChatOptions) {
  const { model, provider, apiKey, messages, onToken, onToolCall, onToolResult, onFinish, onError } = options;

  console.log("[Chat] Starting chat with:", { model, provider, messageCount: messages.length });

  try {
    // Use Codex chat for ChatGPT Plus/Pro (bypasses CORS via Tauri HTTP plugin)
    if (provider === "codex") {
      console.log("[Chat] Using Codex chat for ChatGPT Plus/Pro");
      return codexChat(model, messages, { onToken, onToolCall, onToolResult, onFinish, onError });
    }

    // For OpenAI/Anthropic, use standard AI SDK
    const providerInstance = getProvider(provider, apiKey);

    console.log("[Chat] Created provider instance, starting stream...");

    const result = streamText({
      model: providerInstance(model),
      system: ROBLOX_SYSTEM_PROMPT,
      tools: robloxTools,
      stopWhen: stepCountIs(100), // Allow up to 100 steps for complex tasks
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    let fullText = "";

    console.log("[Chat] Consuming stream...");

    // Use fullStream to capture all events including tool calls
    for await (const event of result.fullStream) {
      switch (event.type) {
        case "text-delta":
          fullText += event.text;
          onToken?.(event.text);
          break;

        case "tool-call":
          console.log("[Chat] Tool call:", event.toolName);
          onToolCall?.({
            id: event.toolCallId,
            name: event.toolName,
            input: event.input as Record<string, unknown>,
          });
          break;

        case "tool-result":
          console.log("[Chat] Tool result for:", event.toolCallId);
          onToolResult?.({
            id: event.toolCallId,
            output: event.output,
          });
          break;

        case "error":
          console.error("[Chat] Stream error:", event.error);
          break;
      }
    }

    console.log("[Chat] Stream complete, text length:", fullText.length);
    onFinish?.(fullText);
    return fullText;
  } catch (error) {
    console.error("[Chat] Error:", error);
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

// Hook for using chat in components
export function useChat() {
  const { selectedModel, selectedProvider, getApiKey } = useSettingsStore();
  const { authMethod, isOAuthAuthenticated } = useAuthStore();

  const sendMessage = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    callbacks?: ChatCallbacks
  ) => {
    // Determine provider and auth method
    let provider: ProviderType;
    let apiKey: string;
    let model: string;

    console.log("[useChat] Selected provider:", selectedProvider, "Model:", selectedModel);
    console.log("[useChat] Auth method:", authMethod, "OAuth authenticated:", isOAuthAuthenticated());

    // Handle OpenRouter separately - it uses its own API key
    if (selectedProvider === "openrouter") {
      const openrouterKey = getApiKey("openrouter");
      if (!openrouterKey) {
        throw new Error("No OpenRouter API key configured. Please add one in settings.");
      }
      console.log("[useChat] Using OpenRouter");
      provider = "openrouter";
      apiKey = openrouterKey;
      model = selectedModel;
      return chat({ model, provider, apiKey, messages, ...callbacks });
    }

    // Check if using Codex (either via authMethod=oauth or selectedProvider=codex)
    const useCodex =
      (authMethod === "oauth" && isOAuthAuthenticated()) || selectedProvider === "codex";

    if (useCodex && isOAuthAuthenticated()) {
      // Use Codex with OAuth
      console.log("[useChat] Using Codex with OAuth");
      provider = "codex";
      apiKey = "codex-oauth"; // Dummy, actual auth handled in codexFetch
      model = selectedModel;
    } else if (useCodex && !isOAuthAuthenticated()) {
      // Codex selected but not authenticated - try OpenAI API key
      console.log("[useChat] Codex selected but not OAuth authenticated, trying OpenAI API key");
      const openaiKey = getApiKey("openai");
      if (openaiKey) {
        provider = "openai";
        apiKey = openaiKey;
        model = selectedModel;
      } else {
        throw new Error("Please sign in with ChatGPT Plus/Pro or add an OpenAI API key in settings");
      }
    } else {
      // Use API key
      provider = selectedProvider === "codex" ? "openai" : selectedProvider;
      const key = getApiKey(provider as "openai" | "anthropic");

      if (!key) {
        throw new Error(`No API key configured for ${provider}. Please add one in settings or sign in with ChatGPT Plus/Pro.`);
      }

      console.log("[useChat] Using API key for provider:", provider);
      apiKey = key;
      model = selectedModel;
    }

    return chat({
      model,
      provider,
      apiKey,
      messages,
      ...callbacks,
    });
  };

  return { sendMessage };
}

// Check if any auth is configured
export function hasAnyAuth(): boolean {
  const { apiKeys } = useSettingsStore.getState();
  const hasApiKey = !!(apiKeys.openai || apiKeys.anthropic || apiKeys.openrouter);
  const hasOAuth = isCodexAuthenticated();
  return hasApiKey || hasOAuth;
}
