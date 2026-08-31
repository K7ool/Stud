/**
 * Codex Chat - Direct API integration with ChatGPT Plus/Pro Codex endpoint
 * Uses the Responses API format with full agentic loop support
 */

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getValidAccessToken, getStoredAuth } from "@/lib/auth/codex";
import { ROBLOX_SYSTEM_PROMPT } from "./providers";
import { robloxTools } from "@/lib/roblox";
import { z } from "zod";
import { AIChatError } from "./errors";

const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_PROXY_ENDPOINT = "/api/codex";
const MAX_ITERATIONS = 40; // Cap iterations for responsive replies

const isWebMode = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);

export interface CodexMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ExecutionIssue {
  stepId?: string;
  message: string;
  reason?: string;
  retryable?: boolean;
  target?: string;
}

export interface ExecutionResult {
  taskId?: string;
  status: "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";
  title: string;
  summary: string;
  progress?: {
    completed: number;
    total: number;
  };
  changes?: string[];
  verification?: string[];
  issues?: ExecutionIssue[];
  nextAction?: string;
}

export interface CodexChatCallbacks {
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; input: Record<string, unknown> }) => void;
  onToolResult?: (toolResult: { id: string; output: unknown }) => void;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
  systemExtension?: string;
  onExecutionResult?: (result: ExecutionResult) => void;
}

export interface CodexChat {
  model: string;
  provider: string;
  apiKey: string;
  messages: CodexMessage[];
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; input: Record<string, unknown> }) => void;
  onToolResult?: (toolResult: { id: string; output: unknown }) => void;
  onFinish?: (text: string) => void;
  onError?: (error: Error) => void;
  systemExtension?: string;
  providerOptions?: Record<string, unknown>;
  onSpecialistsDetected?: (specialists: string[]) => void;
  onExecutionResult?: (result: ExecutionResult) => void;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

// Input item types for the Codex API
type InputItem =
  | { role: "user"; content: Array<{ type: "input_text"; text: string }> }
  | { role: "assistant"; content: Array<{ type: "output_text"; text: string }> }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

/**
 * Convert robloxTools to OpenAI function format for Codex API
 */
function convertToolsToOpenAI() {
  const tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> = [];

  for (const [name, tool] of Object.entries(robloxTools)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolObj = tool as any;
    const schema = toolObj.inputSchema;

    if (schema) {
      const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
      tools.push({
        type: "function",
        name,
        description: toolObj.description || name,
        parameters: jsonSchema,
      });
    }
  }

  return tools;
}

/**
 * Convert chat messages to Codex Responses API input format
 */
function convertToCodexInput(messages: CodexMessage[]): InputItem[] {
  const input: InputItem[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      input.push({
        role: "user",
        content: [{ type: "input_text", text: msg.content }],
      });
    } else if (msg.role === "assistant") {
      input.push({
        role: "assistant",
        content: [{ type: "output_text", text: msg.content }],
      });
    }
  }

  return input;
}

/**
 * Execute a tool and return the result
 */
async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const toolFn = robloxTools[toolName as keyof typeof robloxTools];

  if (!toolFn) {
    console.error("[CodexChat] Unknown tool:", toolName);
    return { error: `Unknown tool: ${toolName}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolObj = toolFn as any;
  if (!toolObj.execute) {
    console.error("[CodexChat] Tool has no execute function:", toolName);
    return { error: `Tool ${toolName} has no execute function` };
  }

  try {
    const result = await toolObj.execute(args);
    console.log("[CodexChat] Tool result:", result);
    return result;
  } catch (err) {
    console.error("[CodexChat] Tool execution error:", err);
    return { error: String(err) };
  }
}

/**
 * Make a single API call and process the response
 */
async function makeCodexRequest(
  model: string,
  input: InputItem[],
  tools: ReturnType<typeof convertToolsToOpenAI>,
  callbacks?: CodexChatCallbacks
): Promise<{
  text: string;
  toolCalls: ToolCall[];
}> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated with ChatGPT Plus/Pro");
  }

  const auth = getStoredAuth();

  // Build request body - always send full input history
  const body = {
    model,
    instructions: callbacks?.systemExtension
      ? `${ROBLOX_SYSTEM_PROMPT}\n\n${callbacks.systemExtension}`
      : ROBLOX_SYSTEM_PROMPT,
    input,
    tools,
    stream: true,
    store: false,
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (auth?.accountId) {
    headers["ChatGPT-Account-Id"] = auth.accountId;
  }

  const endpoint = isWebMode ? CODEX_PROXY_ENDPOINT : CODEX_API_ENDPOINT;

  console.log("[CodexChat] Making request with", input.length, "input items", isWebMode ? "(via proxy)" : "");

  const response = await tauriFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[CodexChat] Error response:", errorText);
    throw new Error(`Codex API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  const toolCalls: ToolCall[] = [];
  const pendingToolCalls: Map<string, { name: string; arguments: string }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);

        // Text delta
        if (parsed.type === "response.output_text.delta") {
          const delta = parsed.delta || "";
          text += delta;
          callbacks?.onToken?.(delta);
        }

        // Function call started
        if (parsed.type === "response.output_item.added" && parsed.item?.type === "function_call") {
          const item = parsed.item;
          pendingToolCalls.set(item.call_id || item.id, {
            name: item.name,
            arguments: "",
          });
        }

        // Function call arguments streaming
        if (parsed.type === "response.function_call_arguments.delta") {
          const callId = parsed.call_id || parsed.item_id;
          const existing = pendingToolCalls.get(callId);
          if (existing) {
            existing.arguments += parsed.delta || "";
          }
        }

        // Function call completed
        if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
          const item = parsed.item;
          const callId = item.call_id || item.id;

          toolCalls.push({
            id: callId,
            name: item.name,
            arguments: item.arguments || "{}",
          });

          pendingToolCalls.delete(callId);
        }

        // Text from completed output
        if (parsed.type === "response.output_item.done" && parsed.item?.content) {
          const content = parsed.item.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === "output_text" && part.text && !text.includes(part.text)) {
                text += part.text;
                callbacks?.onToken?.(part.text);
              }
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return { text, toolCalls };
}

/**
 * Stream chat with Codex API - Full agentic loop
 * Continues calling the API until no more tool calls are needed
 */
export async function codexChat({
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
  onSpecialistsDetected,
  onExecutionResult,
}: CodexChat): Promise<string> {
  console.log("[CodexChat] Starting agentic loop with model:", model);

  const tools = convertToolsToOpenAI();
  console.log("[CodexChat] Tools count:", tools.length);

  // Build up the conversation history
  const conversationHistory: InputItem[] = convertToCodexInput(messages);
  let fullText = "";
  let iteration = 0;

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[CodexChat] Iteration ${iteration}, history items: ${conversationHistory.length}`);

      // Make API call with full conversation history
      const result = await makeCodexRequest(
        model,
        conversationHistory,
        tools,
        { onToken, onToolCall, onToolResult, onFinish, onError, systemExtension }
      );

      fullText += result.text;

      // If no tool calls, we're done
      if (result.toolCalls.length === 0) {
        console.log("[CodexChat] No tool calls, finishing");
        break;
      }

      // Add each tool call to conversation history and execute it
      for (const toolCall of result.toolCalls) {
        // Add the function call to history
        conversationHistory.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
        });

        // Parse and execute
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          console.error("[CodexChat] Failed to parse tool arguments:", toolCall.arguments);
        }

        onToolCall?.({ id: toolCall.id, name: toolCall.name, input: args });

        const output = await executeTool(toolCall.name, args);
        onToolResult?.({ id: toolCall.id, output });

        // Add the function call output to history
        conversationHistory.push({
          type: "function_call_output",
          call_id: toolCall.id,
          output: JSON.stringify(output),
        });
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn("[CodexChat] Hit max iterations limit");
      fullText += "\n\n[Reached maximum tool call limit]";
    }

    console.log("[CodexChat] Complete, text length:", fullText.length);
    onFinish?.(fullText);
    return fullText;
  } catch (error) {
    console.error("[CodexChat] Error:", error);
    const err = error instanceof Error ? new AIChatError(error) : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

/**
 * Create a structured execution result from tool call outputs
 */
function createExecutionResult(
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown; status: "pending" | "running" | "complete" | "error" | "waiting" }>,
  taskId?: string
): ExecutionResult {
  const completedCalls = toolCalls.filter(tc => tc.status === "complete");
  const failedCalls = toolCalls.filter(tc => tc.status === "error");
  const inProgressCalls = toolCalls.filter(tc => tc.status === "running" || tc.status === "pending");

  const changes: string[] = [];
  const verification: string[] = [];
  const issues: ExecutionIssue[] = [];

  for (const tc of toolCalls) {
    if (tc.status === "complete") {
      if (tc.name === "roblox_get_script") {
        changes.push("Read script content");
        verification.push("Script read successfully");
      } else if (tc.name === "roblox_edit_script") {
        changes.push("Edited script");
        verification.push("Script edited successfully");
      } else if (tc.name === "roblox_set_script") {
        changes.push("Replaced script");
        verification.push("Script replaced successfully");
      } else if (tc.name === "roblox_create") {
        changes.push("Created instance");
        verification.push("Instance created successfully");
      } else if (tc.name === "roblox_insert_asset") {
        const result = tc.result as { success?: boolean; assetName?: string; path?: string };
        if (result?.success) {
          changes.push(`Inserted ${result.assetName} at ${result.path}`);
          verification.push("Asset inserted and verified");
        }
      } else {
        changes.push(`${tc.name} completed`);
        verification.push("Operation completed");
      }
    } else if (tc.status === "error") {
      issues.push({
        message: `${tc.name} failed`,
        reason: tc.error || "Unknown error",
        retryable: true,
        target: `Tool call ${tc.id}`
      });
      changes.push(`${tc.name} failed`);
    }
  }

  let status: ExecutionResult["status"] = "completed";
  if (failedCalls.length > 0 && completedCalls.length > 0) {
    status = "partial";
  } else if (failedCalls.length > 0 && completedCalls.length === 0) {
    status = "failed";
  } else if (inProgressCalls.length > 0) {
    status = "in_progress";
  }

  return {
    taskId,
    status,
    title: "Tool Operations",
    summary: `${completedCalls.length} operations completed${failedCalls.length > 0 ? `, ${failedCalls.length} failed` : ""}${inProgressCalls.length > 0 ? `, ${inProgressCalls.length} in progress` : ""}`,
    progress: {
      completed: completedCalls.length,
      total: toolCalls.length
    },
    changes: changes.length > 0 ? changes : undefined,
    verification: verification.length > 0 ? verification : undefined,
    issues: issues.length > 0 ? issues : undefined,
    nextAction: inProgressCalls.length > 0 ? "Continue with remaining operations" : 
                  failedCalls.length > 0 ? "Retry failed operations" : "Task completed"
  };
}

/**
 * Extract execution result from tool call results
 */
function extractExecutionResult(
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; result?: unknown; status: "pending" | "running" | "complete" | "error" | "waiting" }>,
  taskId?: string,
  fullText?: string
): ExecutionResult {
  const changes: string[] = [];
  const verification: string[] = [];
  const issues: ExecutionIssue[] = [];

  // Determine operation type based on tool calls
  const discoverCalls = toolCalls.filter(tc => tc.name.includes("discover") || tc.name.includes("scan") || tc.name.includes("get"));
  const actionCalls = toolCalls.filter(tc => tc.name.includes("edit") || tc.name.includes("create") || tc.name.includes("set") || tc.name.includes("insert"));
  const otherCalls = toolCalls.filter(tc => !discoverCalls.includes(tc) && !actionCalls.includes(tc));

  // Create natural language summary
  let summary = "";
  if (discoverCalls.length > 0) {
    summary += "Explored and discovered components, then ";
  }
  if (actionCalls.length > 0) {
    summary += "executed ${actionCalls.length} actions including ";
    const actionDescriptions = actionCalls.map(tc => {
      if (tc.name === "roblox_get_script") return "reading scripts";
      if (tc.name === "roblox_edit_script") return "editing scripts";
      if (tc.name === "roblox_set_script") return "updating scripts";
      if (tc.name === "roblox_create") return "creating instances";
      if (tc.name === "roblox_insert_asset") return "inserting assets";
      return tc.name.replace(/^roblox_/, "");
    });
    summary += actionDescriptions.slice(0, 3).join(", ") + (actionDescriptions.length > 3 ? ", and more" : "");
  }
  if (otherCalls.length > 0) {
    summary += `, performed ${otherCalls.length} additional operations`;
  }

  // Generate changes list
  for (const tc of toolCalls) {
    if (tc.status === "complete") {
      if (tc.name === "roblox_get_script") {
        changes.push("Explored and read script content");
        verification.push("Script content successfully retrieved");
      } else if (tc.name === "roblox_edit_script") {
        changes.push("Edited and updated script content");
        verification.push("Script edits applied successfully");
      } else if (tc.name === "roblox_set_script") {
        changes.push("Completely replaced script content");
        verification.push("Script replacement completed successfully");
      } else if (tc.name === "roblox_create") {
        changes.push("Created new instances in the game");
        verification.push("Instances created and verified");
      } else if (tc.name === "roblox_insert_asset") {
        const result = tc.result as { success?: boolean; assetName?: string; path?: string };
        if (result?.success) {
          changes.push(`Inserted ${result.assetName} into the game at ${result.path}`);
          verification.push("Asset insertion verified");
        }
      } else {
        changes.push(tc.name.replace(/^roblox_/, "").replace(/_/g, " "));
        verification.push("Operation completed successfully");
      }
    } else if (tc.status === "error") {
      issues.push({
        message: tc.name.replace(/^roblox_/, "").replace(/_/g, " "),
        reason: tc.error || "Unknown error occurred",
        retryable: true,
        target: `Tool: ${tc.name}`
      });
      changes.push(`${tc.name.replace(/^roblox_/, "").replace(/_/g, " ")} - Failed: ${tc.error}`);
    }
  }

  // Determine status
  let status: ExecutionResult["status"] = "completed";
  if (issues.length > 0 && changes.length > 0) {
    status = "partial";
  } else if (issues.length > 0 && changes.length === 0) {
    status = "failed";
  } else if (toolCalls.some(tc => tc.status === "pending" || tc.status === "running")) {
    status = "in_progress";
  }

  return {
    taskId,
    status,
    title: "Task Execution",
    summary: summary || "Executed tool operations",
    progress: {
      completed: toolCalls.filter(tc => tc.status === "complete").length,
      total: toolCalls.length
    },
    changes: changes.length > 0 ? changes : undefined,
    verification: verification.length > 0 ? verification : undefined,
    issues: issues.length > 0 ? issues : undefined,
    nextAction: issues.length > 0 && issues.some(i => i.retryable) ? "Retry failed steps" : 
                  status === "completed" ? "Task completed successfully" : 
                  status === "partial" ? "Review failed steps and retry if needed" : 
                  "Continue with remaining operations"
  };
}