/**
 * Roblox AI Integration Module
 *
 * Integrates:
 * - Knowledge layer (official Roblox docs, best practices)
 * - Specialist routing (auto-detect and activate specialists)
 * - Enhanced system prompt (all 40 principles)
 * - Project awareness (understand existing systems)
 *
 * Used by providers.ts to enhance the system prompt for each conversation.
 */

import { ENHANCED_ROBLOX_SYSTEM_PROMPT } from "./system-prompt-enhanced";
import {
  detectSpecialists,
  buildSpecialistSystemExtension,
  type SpecialistMode,
} from "@/lib/roblox/specialist-router";
import { getLuauGuide, getSecurityGuide, describeArchitecture } from "@/lib/roblox/knowledge";

export interface EnhancedChatOptions {
  model: string;
  provider: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userContext?: string; // Recent context for specialist detection
  includeProjectState?: boolean; // Include project analysis in context
}

export interface EnhancedSystemPromptResult {
  systemPrompt: string;
  activatedSpecialists: SpecialistMode[];
  context: {
    knowledgeInsight?: string;
    projectAnalysis?: string;
    specialists: SpecialistMode[];
  };
}

/**
 * Build an enhanced system prompt that includes specialist modes and context.
 * This replaces the static ROBLOX_SYSTEM_PROMPT with a dynamic, context-aware version.
 */
export function buildEnhancedSystemPrompt(
  userMessage: string,
  recentContext: string = ""
): EnhancedSystemPromptResult {
  // Step 1: Detect which specialists should activate
  const specialists = detectSpecialists({
    userMessage,
    recentContext,
  });

  // Step 2: Build specialist extensions
  const specialistExtension = buildSpecialistSystemExtension(specialists);

  // Step 3: Assemble final system prompt
  const finalPrompt = `${ENHANCED_ROBLOX_SYSTEM_PROMPT}${specialistExtension}`;

  return {
    systemPrompt: finalPrompt,
    activatedSpecialists: specialists,
    context: {
      specialists,
    },
  };
}

/**
 * Get context-aware hints for the current conversation.
 * These are optional additions to help the AI understand what to prioritize.
 */
export function getContextualHints(userMessage: string): string {
  const hints: string[] = [];

  if (userMessage.toLowerCase().includes("security") || userMessage.toLowerCase().includes("exploit")) {
    hints.push("🔒 SECURITY MODE: Think like an attacker. Validate everything on server.");
  }

  if (
    userMessage.toLowerCase().includes("ui") ||
    userMessage.toLowerCase().includes("gui") ||
    userMessage.toLowerCase().includes("design")
  ) {
    hints.push("🎨 UI MODE: Responsive layouts, no hardcoding positions.");
  }

  if (userMessage.toLowerCase().includes("lag") || userMessage.toLowerCase().includes("slow")) {
    hints.push("⚡ PERFORMANCE MODE: Profile first, then optimize. Look for loops and expensive operations.");
  }

  if (userMessage.toLowerCase().includes("error") || userMessage.toLowerCase().includes("bug")) {
    hints.push("🐛 DEBUG MODE: Reproduce → Inspect → Diagnose → Patch minimally → Verify.");
  }

  if (userMessage.toLowerCase().includes("network") || userMessage.toLowerCase().includes("remote")) {
    hints.push("🌐 NETWORKING MODE: Server validates ALL client arguments. Use RemoteEvent unless you need request/response.");
  }

  return hints.join("\n");
}

/**
 * Get quick reference for Luau best practices.
 */
export function getLuauQuickRef(): string {
  return `
LUAU QUICK REFERENCE:

✓ Always use:
  • task.wait() not wait()
  • task.spawn() not spawn()
  • local scope (not globals)
  • --!strict for ModuleScripts
  • pcall() for error handling

✗ Avoid:
  • Deprecated wait(), spawn()
  • Global state (_G, shared)
  • Deep nesting (use early returns)
  • Loops without escape conditions
  • Leaking connections (no disconnect)
`;
}

/**
 * Get quick reference for security checks.
 */
export function getSecurityQuickRef(): string {
  return `
SECURITY QUICK CHECKLIST:

□ Server validates EVERY RemoteEvent/RemoteFunction argument
□ Ownership verified before allowing modifications
□ Currency/items changed on server only
□ Rate limits on exploitable actions
□ Admin commands verify user role
□ No arbitrary instance paths from client
□ Strings sanitized (no code injection)
□ High-frequency actions are rate-limited
`;
}

/**
 * Inject knowledge hints into a conversation.
 * This helps the AI stay grounded in official Roblox practices.
 */
export function injectKnowledgeHints(
  userMessage: string,
  isFirstMessage: boolean = false
): string {
  const hints: string[] = [];

  // For first message, give brief orientation
  if (isFirstMessage) {
    hints.push(`
## Stud: Roblox AI Engineer

I'll help you build professional Roblox games. I specialize in:
• Secure multiplayer systems (server-authoritative)
• Production Luau code (not quick hacks)
• Architecture & best practices
• Debugging & optimization
• UI design & responsiveness

Before I start, I'll:
1. Inspect your existing project
2. Identify systems to reuse
3. Detect what specialists you need
4. Build or modify code with verification
    `);
  }

  // Check for API-related questions
  if (
    userMessage.includes("API") ||
    userMessage.includes("method") ||
    userMessage.includes("property")
  ) {
    hints.push(
      "\n💡 TIP: I'll verify official Roblox API documentation to ensure accuracy."
    );
  }

  // Check for architecture questions
  if (
    userMessage.includes("architecture") ||
    userMessage.includes("structure") ||
    userMessage.includes("organize")
  ) {
    hints.push("\n💡 TIP: I'll scan your project first to understand existing patterns.");
  }

  return hints.join("\n");
}

/**
 * Format a project analysis for context inclusion.
 * This helps the AI understand what systems already exist.
 */
export function formatProjectContext(analysis: {
  projectName: string;
  systems: Array<{ name: string; type: string }>;
  gaps: string[];
  recommendations: string[];
}): string {
  if (!analysis.systems || analysis.systems.length === 0) {
    return `PROJECT: ${analysis.projectName}\nNo systems detected yet.`;
  }

  return `
PROJECT: ${analysis.projectName}

EXISTING SYSTEMS:
${analysis.systems.map((s) => `  • ${s.name} (${s.type})`).join("\n")}

POTENTIAL GAPS:
${analysis.gaps.map((g) => `  ⚠ ${g}`).join("\n")}

SUGGESTED NEXT STEPS:
${analysis.recommendations.map((r) => `  → ${r}`).join("\n")}
`;
}

/**
 * Create a system message for chat that includes knowledge context.
 * Use this at the start of a conversation to ground the AI.
 */
export function createKnowledgeAnchor(): string {
  return `
You have access to comprehensive Roblox knowledge:

1. **Official APIs**: Roblox Engine classes, methods, properties, security contexts
2. **Best Practices**: Modular services, RemoteEvent patterns, server authority
3. **Luau Standards**: task.*, local scope, type annotations, error handling
4. **Security**: Validation, rate limiting, ownership checks, exploit prevention
5. **Performance**: Event-driven patterns, caching, object pooling, profiling
6. **Architecture**: ReplicatedStorage structure, DataStores, CollectionService, UI patterns

When developing Roblox games:
- **Inspect first**: Check existing systems before building new ones
- **Reuse patterns**: Extend existing services rather than duplicating
- **Server authority**: All critical state owned by server
- **Verify always**: Test in Studio before claiming success
- **Think security**: "What if the client is malicious?"

Ready to build something great.
`;
}

/**
 * Build a detailed context document for complex tasks.
 * Use this for multi-system development or large refactorings.
 */
export function buildDetailedContext(options: {
  task: string;
  existingSystems?: string[];
  dependentSystems?: string[];
  securityConsiderations?: string[];
  performanceConcerns?: string[];
}): string {
  const lines: string[] = [
    `## Task Context`,
    `Task: ${options.task}`,
    ``,
  ];

  if (options.existingSystems?.length) {
    lines.push(`### Existing Systems to Leverage`);
    options.existingSystems.forEach((s) => lines.push(`  • ${s}`));
    lines.push(``);
  }

  if (options.dependentSystems?.length) {
    lines.push(`### Systems This Depends On`);
    options.dependentSystems.forEach((s) => lines.push(`  • ${s}`));
    lines.push(``);
  }

  if (options.securityConsiderations?.length) {
    lines.push(`### Security Checklist`);
    options.securityConsiderations.forEach((s) => lines.push(`  □ ${s}`));
    lines.push(``);
  }

  if (options.performanceConcerns?.length) {
    lines.push(`### Performance Notes`);
    options.performanceConcerns.forEach((p) => lines.push(`  • ${p}`));
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`Use official Roblox documentation for any API references.`);
  lines.push(`Verify each step in Studio before moving to the next.`);

  return lines.join("\n");
}

/**
 * Export knowledge modules for reference
 */
export const RobloxKnowledge = {
  luauGuide: getLuauGuide(),
  securityGuide: getSecurityGuide(),
  architectureGuide: describeArchitecture(),
  luauQuickRef: getLuauQuickRef(),
  securityQuickRef: getSecurityQuickRef(),
  knowledgeAnchor: createKnowledgeAnchor(),
};
