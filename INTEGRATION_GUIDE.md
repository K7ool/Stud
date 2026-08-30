/**
 * Integration Guide: Update providers.ts to use Enhanced Roblox System Prompt
 *
 * This file shows exactly what to change in src/lib/ai/providers.ts
 * to integrate the new specialist routing and enhanced prompt system.
 */

// ============================================================================
// STEP 1: Add imports to providers.ts
// ============================================================================

// Add these lines at the top of the file:

import { buildEnhancedSystemPrompt } from "@/lib/ai/roblox-integration";
import type { ChatOptions } from "@/lib/ai/providers"; // if needed

// ============================================================================
// STEP 2: Replace the static ROBLOX_SYSTEM_PROMPT
// ============================================================================

// REMOVE the old static prompt (currently ~1500 lines)
// export const ROBLOX_SYSTEM_PROMPT = `You are Stud, an AI assistant...`

// INSTEAD, import the new enhanced version:
import { ENHANCED_ROBLOX_SYSTEM_PROMPT } from "@/lib/roblox/system-prompt-enhanced";

// Keep it as a fallback (no longer used, but reference for backwards compatibility):
// export const ROBLOX_SYSTEM_PROMPT = ENHANCED_ROBLOX_SYSTEM_PROMPT;

// ============================================================================
// STEP 3: Modify the chat() function
// ============================================================================

// BEFORE (current implementation):
/*
export async function chat(options: ChatOptions) {
  const { model, provider, apiKey, messages, onToken, onToolCall, onToolResult, onFinish, onError, systemExtension, providerOptions } = options;

  console.log("[Chat] Starting chat with:", { model, provider, messageCount: messages.length });

  try {
    const providerInstance = getProvider(provider, apiKey);
    const result = streamText({
      model: providerInstance(model),
      system: systemExtension 
        ? `${ROBLOX_SYSTEM_PROMPT}\n\n${systemExtension}`
        : ROBLOX_SYSTEM_PROMPT,  // ← OLD: Static prompt
      tools: robloxTools,
      stopWhen: stepCountIs(40),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(providerOptions ? { providerOptions: ... } : {}),
    });
    // ... rest of function
  }
}
*/

// AFTER (with specialist routing):
export async function chat(options: ChatOptions) {
  const { model, provider, apiKey, messages, onToken, onToolCall, onToolResult, onFinish, onError, systemExtension, providerOptions } = options;

  console.log("[Chat] Starting chat with:", { model, provider, messageCount: messages.length });

  try {
    // NEW: Build enhanced prompt with specialist routing
    const userMessage = messages[messages.length - 1]?.content || "";
    const recentContext = messages.length > 1 
      ? messages[messages.length - 2]?.content 
      : "";
    
    const { systemPrompt: enhancedPrompt, activatedSpecialists } = 
      buildEnhancedSystemPrompt(userMessage, recentContext);

    console.log("[Chat] Activated specialists:", activatedSpecialists);

    // Combine enhanced prompt with any user systemExtension
    const finalSystemPrompt = systemExtension
      ? `${enhancedPrompt}\n\n${systemExtension}`
      : enhancedPrompt;

    const providerInstance = getProvider(provider, apiKey);
    const result = streamText({
      model: providerInstance(model),
      system: finalSystemPrompt, // ← NEW: Dynamic prompt with specialists
      tools: robloxTools,
      stopWhen: stepCountIs(40),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(providerOptions ? { providerOptions: ... } : {}),
    });

    let fullText = "";

    console.log("[Chat] Consuming stream...");

    // Rest of implementation unchanged
    for await (const event of result.fullStream) {
      // ... existing event handling ...
    }

    // ... existing code ...
  } catch (e) {
    // ... existing error handling ...
  }
}

// ============================================================================
// STEP 4: Optional - Log specialist info for debugging
// ============================================================================

// Add this helper function to see which specialists activated:

function logSpecialistActivation(specialists: string[]): void {
  if (specialists.length === 0) return;
  
  const modes = specialists.join(", ");
  console.log(`[Specialists] ${specialists.length} mode(s) active: ${modes}`);
  
  // Map to readable names
  const names: Record<string, string> = {
    "ROBLOX_LUAU_ENGINEER": "🔧 Luau Engineer",
    "ROBLOX_GAMEPLAY_ENGINEER": "🎮 Gameplay Engineer",
    "ROBLOX_UI_ENGINEER": "🎨 UI Engineer",
    "ROBLOX_NETWORK_ENGINEER": "🌐 Network Engineer",
    "ROBLOX_SECURITY_ENGINEER": "🔒 Security Engineer",
    "ROBLOX_STUDIO_PLUGIN_ENGINEER": "🔌 Plugin Engineer",
    "ROBLOX_PERFORMANCE_ENGINEER": "⚡ Performance Engineer",
    "ROBLOX_DEBUG_ENGINEER": "🐛 Debug Engineer",
  };
  
  specialists.forEach(s => {
    console.log(`  ${names[s] || s}`);
  });
}

// Use it in chat():
console.log("[Chat] Activated specialists:", activatedSpecialists);
logSpecialistActivation(activatedSpecialists); // NEW: Pretty logging

// ============================================================================
// STEP 5: Optional - Store specialist info for UI display
// ============================================================================

// If you want to show specialists in the UI, add this to ChatOptions callback:

export interface ChatCallbacks {
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: ToolCallEvent) => void;
  onToolResult?: (toolResult: ToolResultEvent) => void;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
  onSpecialistsDetected?: (specialists: string[]) => void; // NEW
}

// Then in chat():
if (options.onSpecialistsDetected) {
  options.onSpecialistsDetected(activatedSpecialists);
}

// ============================================================================
// STEP 6: Update type exports if needed
// ============================================================================

// Export the new integration types for components to use:
export type { EnhancedSystemPromptResult } from "@/lib/ai/roblox-integration";
export { buildEnhancedSystemPrompt } from "@/lib/ai/roblox-integration";

// ============================================================================
// FULL UPDATED FUNCTION (Copy-paste ready)
// ============================================================================

/*

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { robloxTools } from "@/lib/roblox";
import { isAuthenticated as isCodexAuthenticated } from "@/lib/auth/codex";
import { codexChat } from "./codex-chat";
import { buildEnhancedSystemPrompt } from "@/lib/ai/roblox-integration"; // ← ADD
import { ENHANCED_ROBLOX_SYSTEM_PROMPT } from "@/lib/roblox/system-prompt-enhanced"; // ← ADD

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
      throw new Error(\`Unknown provider: \${type}\`);
  }
}

export function getModelId(_provider: ProviderType, modelId: string) {
  return modelId;
}

// OPTIONAL: Keep for backwards compatibility
export const ROBLOX_SYSTEM_PROMPT = ENHANCED_ROBLOX_SYSTEM_PROMPT;

// ... other exports remain the same ...

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
  onSpecialistsDetected?: (specialists: string[]) => void; // NEW
}

export interface ChatOptions extends ChatCallbacks {
  model: string;
  provider: ProviderType;
  apiKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  systemExtension?: string;
  providerOptions?: Record<string, unknown>;
}

export async function chat(options: ChatOptions) {
  const { model, provider, apiKey, messages, onToken, onToolCall, onToolResult, onFinish, onError, systemExtension, providerOptions, onSpecialistsDetected } = options;

  console.log("[Chat] Starting chat with:", { model, provider, messageCount: messages.length });

  try {
    // Use Codex chat for ChatGPT Plus/Pro
    if (provider === "codex") {
      console.log("[Chat] Using Codex chat for ChatGPT Plus/Pro");
      return codexChat(model, messages, { onToken, onToolCall, onToolResult, onFinish, onError, systemExtension });
    }

    // NEW: Build enhanced prompt with specialist routing
    const userMessage = messages[messages.length - 1]?.content || "";
    const recentContext = messages.length > 1 
      ? messages[messages.length - 2]?.content || ""
      : "";
    
    const { systemPrompt: enhancedPrompt, activatedSpecialists } = 
      buildEnhancedSystemPrompt(userMessage, recentContext);

    console.log("[Chat] Activated specialists:", activatedSpecialists);
    
    // Notify listeners (for UI display)
    onSpecialistsDetected?.(activatedSpecialists);

    // Combine enhanced prompt with user extension
    const finalSystemPrompt = systemExtension
      ? \`\${enhancedPrompt}\n\n\${systemExtension}\`
      : enhancedPrompt;

    const providerInstance = getProvider(provider, apiKey);

    console.log("[Chat] Created provider instance, starting stream...");

    const result = streamText({
      model: providerInstance(model),
      system: finalSystemPrompt, // ← USE ENHANCED PROMPT
      tools: robloxTools,
      stopWhen: stepCountIs(40),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(providerOptions ? { providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"] } : {}),
    });

    let fullText = "";

    console.log("[Chat] Consuming stream...");

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
            input: event.args as Record<string, unknown>,
          });
          break;

        case "tool-result":
          console.log("[Chat] Tool result:", event.toolName);
          onToolResult?.({
            id: event.toolCallId,
            output: event.result,
          });
          break;

        case "error":
          console.error("[Chat] Stream error:", event);
          onError?.(new Error(\`Stream error\`));
          break;

        case "finish":
          console.log("[Chat] Stream finished");
          break;
      }
    }

    console.log("[Chat] Final text length:", fullText.length);
    onFinish?.(fullText);
  } catch (e) {
    console.error("[Chat] Error:", e);
    const error = e instanceof Error ? e : new Error(String(e));
    onError?.(error);
  }
}

*/

// ============================================================================
// VERIFICATION CHECKLIST
// ============================================================================

/*

After updating providers.ts:

□ Imports compile without errors
□ buildEnhancedSystemPrompt is imported correctly
□ ENHANCED_ROBLOX_SYSTEM_PROMPT is imported correctly
□ chat() function modified to call buildEnhancedSystemPrompt
□ finalSystemPrompt is built correctly
□ onSpecialistsDetected callback is optional (backwards compatible)
□ Console logs show activated specialists
□ Chat still works with OpenAI/Anthropic
□ Prompt size is acceptable (~12KB with specialists)
□ No breaking changes to existing API

*/

// ============================================================================
// TESTING
// ============================================================================

/*

Test 1: Basic chat
  Request: "Hi"
  Expected: Generic or minimal specialists
  Check: Console shows specialists

Test 2: Luau code
  Request: "Write a module script"
  Expected: ROBLOX_LUAU_ENGINEER specialist
  Check: Prompt includes Luau guidance

Test 3: GUI design
  Request: "Create an inventory UI"
  Expected: ROBLOX_UI_ENGINEER + ROBLOX_GAMEPLAY_ENGINEER
  Check: Prompt includes UI responsive layout guidance

Test 4: Security
  Request: "Add trading system"
  Expected: ROBLOX_SECURITY_ENGINEER + ROBLOX_NETWORK_ENGINEER
  Check: Prompt includes security validation guidance

Test 5: Performance
  Request: "My game is laggy"
  Expected: ROBLOX_PERFORMANCE_ENGINEER + ROBLOX_DEBUG_ENGINEER
  Check: Prompt includes bottleneck debugging guidance

Test 6: End-to-end
  Connect to real Studio project, run actual Roblox tasks
  Expected: Agent uses knowledge layer, calls minimal tools, verifies results

*/
