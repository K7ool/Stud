import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { robloxTools } from "@/lib/roblox";
import { isAuthenticated as isCodexAuthenticated } from "@/lib/auth/codex";
import { codexChat } from "./codex-chat";
import { AIChatError, classifyProviderError } from "./errors";

export type ProviderType = "openai" | "anthropic" | "codex" | "openrouter" | "opencode";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const OPENCODE_ZEN_API_BASE = "https://opencode.ai/zen/v1";

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
    case "opencode":
      // OpenCode Zen is OpenAI-compatible; free models (Big Pickle, etc.) accept
      // anonymous requests, so an empty key is tolerated.
      return createOpenAI({
        apiKey: apiKey || "anonymous",
        baseURL: OPENCODE_ZEN_API_BASE,
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
export const ROBLOX_SYSTEM_PROMPT = `You are Stud, an AI assistant specialized in Roblox game development. Before responding, always think about what the user actually needs and plan your approach.

You have direct access to Roblox Studio through a set of tools that allow you to:

- Read and modify scripts (Script, LocalScript, ModuleScript) in Studio
- Explore the game hierarchy and instance properties
- Create, delete, clone, and move instances
- Set properties on instances
- Execute Luau code directly in Studio
- Search for instances by name or class
- Search the Creator Store for free models and insert them
- Get game info (name, place ID, universe ID, creator, player count, description)
- Ask the user questions when you need clarification

CRITICAL - MINIMIZE TOOL USAGE / OPTIMIZE FOR SPEED:
Use the SMALLEST number of tools needed to satisfy the request. Every unnecessary tool call adds
latency and makes Studio slower. Follow this decision process BEFORE every tool call:
  1. Is this tool REQUIRED to complete the task?
  2. Can I answer/act correctly without it?
  3. Did a previous tool already give me this information? If yes, REUSE it - do not fetch again.
  4. Is this tool redundant given what I already know?

RULES:
- NEVER call tools speculatively or "just in case". Prefer the single most direct tool.
- NEVER scan the whole game (recursive get_children over Workspace/ReplicatedStorage, listing all
  scripts/remotes/GUIs) unless the user explicitly requests a full analysis, game map, import, or
  project-wide audit. For normal tasks, do targeted inspection only.
- Prefer LOWEST-COST tools. Ranking: exact/structured tool > cached/known info > lightweight read >
  targeted inspection > run_code (last resort).
- Do NOT use roblox_run_code when a structured tool exists (create, set_property, get_children, search,
  move). Run Code is a high-latency FALLBACK only.
- Do NOT call roblox_get_script unless the task involves reading/modifying script source.
- Do NOT call roblox_get_properties unless you need specific property values not already known.
- Answer "is Studio connected?" with roblox_connection_status ONLY.
- For "what is my game?", use roblox_get_game_info ONCE, do not repeat it.
- If multiple independent reads are required and none depends on another, they may run as ONE parallel
  tool block - do not serialize them.
- STOP calling tools as soon as the request is satisfied. Do not keep inspecting after completion.
- Verify MINIMALLY (confirm the target exists / the one change landed). Do not over-verify with extra
  inspections or re-scans.

DO NOT SACRIFICE CORRECTNESS: if information is genuinely needed, get it. The goal is MINIMUM
NECESSARY WORK, not zero tools.

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
- game_map_update: Update the Game Map when you create a new feature (script, NPC, weapon, building, system, etc.). You can pass a 'features' array (up to 8) to add a whole subsystem as multiple blueprint nodes, with 'category' and 'dependencies' linking related mechanics. Use this to show MORE nodes whenever you build or generate anything.
- game_map_add_node: Add a planned/discovered mechanic node to the map without building it.
- game_map_scan: Scan the connected Roblox Studio project and rebuild the map from real data (redeploy this to answer 'what systems are in my game' / 'what's missing').
- game_map_suggest: Get suggestions for what to build next based on the current project

IMPORTANT - After creating anything significant OR brainstorming/generating multiple related ideas, ALWAYS call game_map_update (passing the full 'features' array of the mechanic + its sub-systems) to show more game blueprint nodes on the map. This helps the user see their progress and get relevant suggestions. Whenever you build a system that comprises several mechanics, reflect every one of them as a node - the map should show the whole blueprint, not just one node.

CRITICAL - TASK COMPLETION:
- ALWAYS complete tasks fully. Do NOT stop mid-task to ask if the user wants to continue.
- When given a task, execute ALL necessary steps to completion without prompting.
- Use the minimum number of tool calls needed (see MINIMIZE TOOL USAGE above). Make all REQUIRED tool
  calls before responding, but never redundant ones.
- Only ask the user questions when you genuinely need their input to proceed.

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

Toolbox Integration (CRITICAL - Assets are REAL, Insertion is VERIFIED):

You have access to real Roblox Creator Store assets. The insertion flow is end-to-end:
1. You search the real Toolbox
2. User picks (or you auto-pick)
3. Asset is inserted by the REAL Roblox Studio plugin
4. The plugin VERIFIES the asset landed in Studio
5. You confirm success

WORKFLOW FOR FINDING AND INSERTING ASSETS:

Step 1: Search comprehensively
  - Always use roblox_toolbox_search with natural language queries
  - Use limit:10 or higher to get real variety
  - For "futuristic swords", also try "sci-fi sword", "laser sword", "neon sword"

Step 2: Present ALL results visually
  - Use roblox_ask_user with type:"single" or type:"multi"
  - Include imageUrl thumbnails for every option
  - Format: { label: "Name", value: "assetId", imageUrl: "thumbnailUrl", description: "by Creator" }
  - Append two options: "🔄 Search again" and "🤖 Let AI pick the best"
  - Each search result has askUserOption pre-formatted — spread it directly

Step 3: Handle the user's choice
  - If user picks: call roblox_insert_asset with the chosen assetId
  - If user picks "ai_pick": select the most relevant result by favorites/name match
  - If user picks "search_again": ask what to search for and redo step 1

Step 4: Insertion + Verification (CRITICAL)
  - roblox_insert_asset returns { success, verified, path, foundPath, assetName, message }
  - ALWAYS check verified: if true, the asset is CONFIRMED in Studio
  - If verified=false, the insertion was sent but verification was inconclusive — report honestly
  - After successful insertion, report: "Inserted [Name] into [Path]. It's ready in Studio!"

Step 5: Continue the task
  - After inserting, use the asset! Position it, duplicate it, script it, etc.
  - For "add 5 futuristic swords", after inserting one: duplicate it 4x with roblox_clone
  - Combine toolbox insertion with instance manipulation tools

OTHER TOOLBOX TOOLS:
  - roblox_toolbox_get_asset: Get full details for an asset before inserting
  - roblox_toolbox_inspect: Verify an instance exists at a path (pass verified=true instances here)
  - roblox_toolbox_remove: Remove a wrongly inserted asset

IMPORTANT:
  - The asset IS actually inserted into the user's real Roblox Studio game
  - Studio must be connected for insertion to work (notConnectedError shows connection instructions)
  - Some models contain scripts — warn the user if inserting untrusted models
  - Verified=true means the Roblox Studio plugin confirmed the instance exists
  - For multiple items ("add 5 swords"), insert one, then clone it with roblox_clone

BAD (don't do this):
  - Return asset IDs without inserting
  - Say "Asset inserted" when Studio is not connected
  - Skip presenting results to the user for single clear requests
  - Claim verified=true when it was not returned

GOOD (do this):
  - roblox_toolbox_search → roblox_ask_user → roblox_insert_asset → report verified result
  - For "add 5 cars": insert one → clone it 4 times → position each

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

Always provide clean, well-commented code following Roblox conventions.

TASK EXECUTION & PLANNING:
- For trivial single-action tasks (rename, status check, single property change),
  do NOT call update_task_plan. Just do the work.
- For multi-step tasks (3+ tool calls or a system to build), call update_task_plan
  ONCE with action="replace" to publish the step list before starting work.
- Use action="advance" when you finish a step, with currentStep=<that step id>.
- Use action="add" when you discover a new step mid-execution.
- Use action="remove" to drop a step that is no longer relevant.
- Use action="skip" when inspection reveals a step is unnecessary.
- Use action="fail" (with failure) when a step cannot be completed, and
  action="block" (with blockedReason) when a step is waiting on something
  outside your control (e.g. a user decision) — unblock/retry it later.
- Use action="replan" to rewrite/reorder the plan while preserving the status
  of steps you have already finished (pass the same ids for unchanged steps).
- Use dependsOn[] to express sequencing; prerequisite steps gate their dependents
  (a pending step with unmet deps is shown as blocked). Keep the plan ordered.
- Steps should be 1-line, action-oriented ("Create PetService", "Add equip remote").
- The user has the option to pause, cancel, or reorder; respect their control.

PERSISTENT MEMORY:
- You may receive a "Relevant memory" section in this prompt containing
  durable facts the user has chosen to remember. Use it when it improves
  your answer; ignore it when it is irrelevant to the current question.
- Do NOT mention the memory system, retrieval, or storage implementation
  to the user unless they explicitly ask. Treat memory as natural context.
- Do NOT invent memories. If a fact isn't in the "Relevant memory" section
  and isn't observable in the current project, don't claim to "remember" it.
- Prefer current, observable project state over stale memory. When memory
  conflicts with what you can see in the project now, trust the project.
- Do NOT treat temporary, in-conversation details (e.g. "let's try X this
  once") as permanent facts.
- If the user says "remember that …" / "forget …" / "remember this", act on
  it: save the fact (or delete the matching memory) without re-confirming.
- Keep memory references terse. Inject only the slice that is relevant to
  the current message; do not dump every stored memory into context.`;

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
  systemExtension?: string;
  /** Provider-specific options such as reasoning effort / thinking budget. */
  providerOptions?: Record<string, unknown>;
}

export async function chat(options: ChatOptions) {
  const { model, provider, apiKey, messages, onToken, onToolCall, onToolResult, onFinish, onError, systemExtension, providerOptions } = options;

  console.log("[Chat] Starting chat with:", { model, provider, messageCount: messages.length });

  // Retry-loop state is hoisted here so both the try body and the outer catch
  // can read it (avoids a ReferenceError from a block-scoped `let`).
  let attempt = 0;
  let lastError: unknown = null;
  let fullText = "";
  let gotOutput = false;
  let gotToolCall = false;
  let reportedError = false;

  try {
    // Use Codex chat for ChatGPT Plus/Pro (bypasses CORS via Tauri HTTP plugin)
    if (provider === "codex") {
      console.log("[Chat] Using Codex chat for ChatGPT Plus/Pro");
      return codexChat({
        model,
        provider,
        apiKey,
        messages,
        onToken,
        onToolCall,
        onToolResult,
        onFinish,
        onError,
        systemExtension,
        providerOptions,
      });
    }

    // For OpenAI/Anthropic, use standard AI SDK.
    // maxRetries: 0 disables the SDK's blanket retry so a billing/quota/auth
    // failure surfaces immediately instead of burning 3 attempts. We run our
    // own controlled retry below that only retries transient failures.
    const providerInstance = getProvider(provider, apiKey);

    console.log("[Chat] Created provider instance, starting stream...");
    const openaiOpts = (providerOptions as { openai?: { reasoningEffort?: string } } | undefined)?.openai;
    const anthropicOpts = (providerOptions as { anthropic?: { thinking?: { type?: string } } } | undefined)?.anthropic;
    const aiEffort = openaiOpts?.reasoningEffort ?? (anthropicOpts?.thinking?.type === "enabled" ? "thinking" : "auto");
    console.log(`[AI] provider=${provider} model=${model} effort=${aiEffort}`);

    // Cap retries for the controlled loop below. Billing/auth must be 0.
    const RETRY_LIMIT = 2;
    const RETRY_DELAY_MS = 800;

    while (attempt <= RETRY_LIMIT) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
      attempt++;
      fullText = "";
      gotOutput = false;
      gotToolCall = false;

      try {
        const result = streamText({
          model: providerInstance(model),
          system: systemExtension ? `${ROBLOX_SYSTEM_PROMPT}\n\n${systemExtension}` : ROBLOX_SYSTEM_PROMPT,
          tools: robloxTools,
          stopWhen: stepCountIs(40), // Cap at 40 steps for responsive replies
          maxRetries: 0,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(providerOptions ? { providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"] } : {}),
        });

        console.log("[Chat] Consuming stream...");

        // Use fullStream to capture all events including tool calls
        for await (const event of result.fullStream) {
          switch (event.type) {
            case "text-delta":
              fullText += event.text;
              gotOutput = true;
              onToken?.(event.text);
              break;

            case "tool-call":
              gotToolCall = true;
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
              lastError = event.error;
              // Surface the error event; throw to unwind into retry logic.
              if (gotOutput) {
                throw new AIChatError(event.error);
              }
              throw event.error;
          }
        }

        console.log("[Chat] Stream complete, text length:", fullText.length);

        // A stream that finished with no text and no tool call is not a real
        // completion (e.g. a silent provider hiccup). Surface it as a failure
        // instead of reporting an empty success.
        if (fullText.length === 0 && !gotToolCall) {
          const emptyErr = new AIChatError(
            new Error("The AI provider returned an empty response. Please try again.")
          );
          onError?.(emptyErr);
          reportedError = true;
          throw emptyErr;
        }

        onFinish?.(fullText);
        return fullText;
      } catch (error) {
        lastError = error;
        // Retry only transient failures, and only if nothing has been
        // streamed yet (avoid duplicating a partial assistant response).
        const c = classifyProviderError(error);
        console.error(`[Chat] Attempt ${attempt} failed (${c.code}/${c.retryClass}):`, error);
        if (c.retryClass !== "RETRYABLE" || gotOutput || attempt > RETRY_LIMIT || reportedError) {
          break;
        }
      }
    }

    // Non-retryable (or exhausted retries): wrap with friendly + code info and
    // report exactly once (skip a second onError if the empty-response case
    // already reported).
    const err = lastError instanceof AIChatError ? lastError : new AIChatError(lastError);
    if (!reportedError) {
      onError?.(err);
    }
    throw err;
  } catch (error) {
    console.error("[Chat] Error:", error);
    const err = error instanceof AIChatError ? error : new AIChatError(error);
    if (!reportedError) {
      onError?.(err);
    }
    throw err;
  }
}

// Hook for using chat in components
export function useChat() {
  const { selectedModel, selectedProvider, getApiKey } = useSettingsStore();
  const { authMethod, isOAuthAuthenticated } = useAuthStore();

  const sendMessage = async (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    callbacks?: ChatCallbacks & { systemExtension?: string; providerOptions?: Record<string, unknown> }
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

    // OpenCode Zen free models (Big Pickle, etc.) work without a key.
    if (selectedProvider === "opencode") {
      console.log("[useChat] Using OpenCode Zen");
      provider = "opencode";
      apiKey = getApiKey("opencode") || "";
      model = selectedModel;
      return chat({ model, provider, apiKey, messages, ...callbacks });
    }

    // Only route to Codex OAuth when the user has explicitly selected the
    // "codex" provider AND is authenticated. A selected provider of "openai"
    // must always stay on the OpenAI API key (no silent provider swap), even
    // if a Codex OAuth session happens to exist.
    if (selectedProvider === "codex") {
      if (isOAuthAuthenticated()) {
        console.log("[useChat] Using Codex with OAuth");
        provider = "codex";
        apiKey = "codex-oauth"; // Dummy, actual auth handled in codexFetch
        model = selectedModel;
      } else {
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
      }
    } else {
      // Use the explicitly selected provider's API key.
      provider = selectedProvider;
      const key = getApiKey(provider as "openai" | "anthropic" | "openrouter" | "opencode");

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
  const { apiKeys, selectedProvider } = useSettingsStore.getState();
  const hasApiKey = !!(apiKeys.openai || apiKeys.anthropic || apiKeys.openrouter || apiKeys.opencode);
  const hasOAuth = isCodexAuthenticated();
  // OpenCode Zen free models work without a key.
  const hasOpenCode = apiKeys.opencode || selectedProvider === "opencode";
  return hasApiKey || hasOAuth || hasOpenCode;
}
