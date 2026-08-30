# Task Execution UI Implementation Guide

## Overview

The chat UI now supports structured task execution results with a professional coding-agent interface. Instead of showing raw tool logs, the UI displays:

1. **Execution Result Card** - Summary, changes, verification, issues, and next actions
2. **Tool Activity Group** - Collapsible/expandable tool calls with timing information
3. **Natural Message Content** - Concise AI response

## For Agents & API Integrations

### Generating Execution Results

When completing a task, include an `executionResult` in the message:

```typescript
interface ExecutionResult {
  taskId?: string;                              // Unique task ID
  status: "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";
  title: string;                                 // Task title (e.g., "Cat Discovery Reward")
  summary: string;                               // What was accomplished
  progress?: {
    completed: number;                           // Steps completed
    total: number;                               // Total steps
  };
  changes?: string[];                            // List of changes made
  verification?: string[];                       // Verification results
  issues?: ExecutionIssue[];                     // Any problems encountered
  nextAction?: string;                           // What to do next
}

interface ExecutionIssue {
  stepId?: string;
  message: string;                               // Concise problem description
  reason?: string;                               // Why it failed
  retryable?: boolean;                           // Can user retry?
  target?: string;                               // What was being modified
}
```

### Example 1: Complete Success

```typescript
{
  status: "completed",
  title: "Cat Discovery Reward System",
  summary: "Added a one-time discovery reward to Workspace.RoamingCat.",
  progress: { completed: 4, total: 4 },
  changes: [
    "Created CatFindRewardScript",
    "Added 10-stud detection radius",
    "Added one-time reward protection",
    "Added 25 Coin reward",
    "Added sparkle VFX",
    "Added celebration SFX",
    "Updated Game Map"
  ],
  verification: [
    "Reward script exists in Workspace.RoamingCat",
    "Game Map synchronized",
    "VFX plays correctly"
  ]
}
```

### Example 2: Partial Success

```typescript
{
  status: "partial",
  title: "Cat Discovery Reward System",
  summary: "Added a one-time discovery reward to Workspace.RoamingCat.",
  progress: { completed: 3, total: 4 },
  changes: [
    "Created CatFindRewardScript",
    "Added 10-stud detection radius",
    "Added one-time reward protection",
    "Added 25 Coin reward"
  ],
  verification: [
    "Reward script exists",
    "Game Map synchronized"
  ],
  issues: [{
    message: "Movement speed was not updated",
    target: "Workspace.RoamingCat.WanderScript",
    reason: "Roblox Studio stopped responding",
    retryable: true
  }],
  nextAction: "Reconnect to Studio and retry updating the movement speed"
}
```

### Example 3: Failure

```typescript
{
  status: "failed",
  title: "Pet System Update",
  summary: "Could not update the pet system due to connection issues.",
  issues: [{
    message: "Connection lost to Roblox Studio",
    reason: "Network timeout after 30 seconds",
    retryable: true
  }],
  nextAction: "Reconnect to Studio and retry the task"
}
```

## UI Behavior

### Execution Result Card

- **Header**: Title, status badge, retry button (if applicable)
- **Progress bar**: Visual representation of completion (if progress is set)
- **Summary**: What was accomplished
- **Changes**: Collapsible list of changes made (✓ icon)
- **Verification**: Collapsible list of verified items
- **Issues**: Collapsible list of problems (⚠ icon, highlighted)
- **Next Action**: What to do next (if action needed)
- **Technical Details**: Collapsible section showing tool call count

### Tool Activity Group

- **Header**: "Tool Activity · N calls" with summary
  - Shows count of complete, errors, and running calls
  - Click to expand/collapse
- **Expanded view**: Shows individual tool calls
  - Tool name (formatted)
  - Status indicator
  - Duration (in expanded view only)
  - Input/output/error (in expanded view)

### Message Content

- Still shown after execution results
- Should be concise and conversational
- Don't repeat information already in the execution result
- Can provide additional context or explanation

## When to Use ExecutionResult

✅ **Use ExecutionResult for:**
- Multi-step tasks (3+ tool calls)
- Tasks with potential failures
- Tasks that modify state (script creation, property changes)
- Tasks with verification steps
- Any task where showing structured feedback improves UX

❌ **Don't use ExecutionResult for:**
- Simple queries or information requests
- Single-action tasks that don't modify state
- Tasks where the final message IS the complete result

## Status Badges

The UI uses consistent status indicators:

- **✓ Completed** - All steps successful, fully verified
- **◐ Partially Completed** - Some steps done, some failed/skipped
- **✕ Failed** - Task did not complete, error occurred
- **⏸ Blocked** - Task paused or waiting for input
- **⏹ Cancelled** - User cancelled or task aborted
- **◉ In Progress** - Task currently running

## Grouping Tool Calls

Tools are automatically grouped in a single collapsible section. The UI shows:
- Total call count
- Summary of results (e.g., "6 complete • 1 error")
- Individual tool cards when expanded

Each tool card shows:
- Tool name (formatted, e.g., "Get Script" not "roblox_get_script")
- Status with icon
- Duration (when available)
- Input/output/error (in expanded view)

## Timing Information

Tool duration is recorded in the chat store:

```typescript
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error" | "waiting";
  error?: string;
  duration?: number; // Duration in milliseconds
  requestId?: string;
}
```

When tools complete, update the duration:

```typescript
// Before tool execution
const startTime = Date.now();

// Execute tool...

// After tool completes
const duration = Date.now() - startTime;
addToolCall(messageId, {
  name: "roblox_get_script",
  args: { ... },
  result: { ... },
  status: "complete",
  duration  // Set duration
});
```

## Integration with Task Queue

When a task is enqueued:

1. Create task with steps: `useTaskStore.enqueue({ ... steps, status: "pending" })`
2. As task runs, update progress: `useTaskStore.setProgress(taskId, progress)`
3. Complete task with results: `useTaskStore.setStatus(taskId, "completed")`
4. Show execution result in chat: Add `executionResult` to message

The TaskPanel shows real-time progress while the ExecutionResultCard shows final results.

## Performance Considerations

- **Tool cards are collapsed by default** - Reduces visual clutter
- **Lazy loading** - Tool inputs/outputs only shown when expanded
- **Granular updates** - Only affected components re-render
- **No full chat re-render** - When one tool completes, only that tool card updates

## Mobile & Responsive Design

The execution result card works on all screen sizes:

- On mobile, sections stack vertically
- Issue/next-action sections use warning colors for visibility
- Collapse/expand works with touch
- Technical details section can be hidden entirely on small screens

## Dark/Light Theme Support

All components use semantic color tokens:
- `text-foreground` / `text-muted-foreground` for text
- `bg-card` / `bg-muted` for backgrounds
- Status colors automatically adjust for dark mode
- No hardcoded colors

## Examples in the UI

### Simple Query (No ExecutionResult)

User: "How do I create a server script in Roblox?"

AI Response (no execution result, just content):
```
To create a server script in Roblox:

1. In the Explorer, right-click ServerScriptService
2. Click "Insert Object" → "Script"
3. Double-click the script to edit it
4. Write your Luau code...
```

### Tool Usage (No ExecutionResult)

User: "What's in the ReplicatedStorage?"

AI Response (no execution result, just shows tool):
```
Tool Activity: 1 call
├─ ✓ List Folder Contents

ReplicatedStorage contains:
- GameConfig (Folder)
- Utils (Folder)
- Templates (Folder)
```

### Task Completion (With ExecutionResult)

User: "Add a cat discovery reward system"

AI Response:

```
┌─────────────────────────────────────────┐
│ ✓ Completed                             │
│ Cat Discovery Reward System             │
│ 7/7 steps complete                      │
│                                         │
│ SUMMARY                                 │
│ Added a one-time 25 Coin discovery      │
│ reward when players find the cat.       │
│                                         │
│ CHANGES                                 │
│ ✓ Created CatFindRewardScript          │
│ ✓ Added 10-stud detection radius       │
│ ✓ Added one-time reward protection     │
│ ✓ Added 25 Coin reward                 │
│ ✓ Added sparkle VFX                    │
│ ✓ Added celebration SFX                │
│ ✓ Updated Game Map                     │
│                                         │
│ VERIFICATION                            │
│ ✓ Script exists in Workspace            │
│ ✓ Game Map synchronized                 │
│                                         │
│ ▸ Technical Details · 7 tools          │
└─────────────────────────────────────────┘

The cat will now reward players with 25 coins 
the first time they discover it, within a 
10-stud radius.
```

## API Reference

### ExecutionResultCard Props

```typescript
interface ExecutionResultCardProps {
  result: ExecutionResult;           // The execution result data
  toolCallCount?: number;            // Number of tool calls (shows in technical details)
  onRetry?: () => void;              // Callback when user clicks retry
  className?: string;                // Additional CSS classes
}
```

### ToolActivityGroup Props

```typescript
interface ToolActivityGroupProps {
  toolCalls: Array<ToolCall & { id: string }>;
  groupTitle?: string;               // Defaults to "Tool Activity"
  className?: string;
}
```

### LiveProgressIndicator Props

```typescript
interface LiveProgressIndicatorProps {
  title: string;
  steps: LiveProgressStep[];
  currentStepIndex?: number;
  className?: string;
}

interface LiveProgressStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}
```

## Known Limitations & Future Work

- [ ] Retry mechanism not yet wired to task system
- [ ] Live progress indicator not yet integrated into chat
- [ ] Task dependency visualization in progress bar
- [ ] Step-by-step retry (only full retry currently)
- [ ] Execution result export/save functionality
- [ ] Comparison between expected vs actual result

## Questions?

Refer to the component source files:
- `src/components/ui/execution-status-badge.tsx` - Status badges
- `src/components/ui/execution-result-card.tsx` - Main result card
- `src/components/ui/tool-activity-group.tsx` - Tool grouping
- `src/components/ui/live-progress-indicator.tsx` - Live progress
- `src/components/ui/tool-call.tsx` - Individual tool cards
