# Quick Start: Using the New Execution UI

## For Agents/API Integrations

### When to Send ExecutionResult

Send an `executionResult` when:
- ✓ Task completed (multi-step)
- ✓ Partial success (some steps failed)
- ✓ Failure (overall failure)
- ✓ Anything with changes/verification needed

Don't send when:
- ✕ Just answering a question
- ✕ Single action (no result card needed)

### Minimal Example

```typescript
// Agent completes a task
const message = {
  role: "assistant",
  content: "✓ Pet system created! Players can now adopt and care for pets.",
  executionResult: {
    status: "completed",
    title: "Pet System",
    summary: "Created a complete pet adoption and care system.",
    changes: [
      "Created PetService module",
      "Added pet adoption logic",
      "Added care mechanics (feeding, playing)",
      "Integrated with player saves"
    ]
  },
  toolCalls: [
    { id: "1", name: "roblox_create_script", status: "complete", ... },
    { id: "2", name: "roblox_get_script", status: "complete", ... },
    // ... more tools
  ]
};
```

**Result in UI:**

```
┌──────────────────────────────┐
│ ✓ Completed                  │
│ Pet System                   │
│                              │
│ SUMMARY                      │
│ Created a complete pet       │
│ adoption and care system.    │
│                              │
│ CHANGES                      │
│ ✓ Created PetService module  │
│ ✓ Added pet adoption logic   │
│ ✓ Added care mechanics       │
│ ✓ Integrated with saves      │
│                              │
│ ▸ Technical Details · 6 tools│
└──────────────────────────────┘

✓ Pet system created! Players can now 
adopt and care for pets.
```

### Full Example with Progress & Issues

```typescript
const result = {
  status: "partial",
  title: "Cat Discovery Reward System",
  summary: "Added most of the discovery reward system.",
  progress: { completed: 3, total: 4 },
  
  changes: [
    "Created CatFindRewardScript",
    "Added detection radius",
    "Added one-time reward protection",
    "Added VFX and SFX"
  ],
  
  verification: [
    "Script exists and loads",
    "Reward mechanics work"
  ],
  
  issues: [{
    message: "Could not update movement speed",
    target: "Workspace.RoamingCat.WanderScript",
    reason: "Roblox Studio stopped responding",
    retryable: true
  }],
  
  nextAction: "Reconnect to Studio and retry the movement-speed update"
};
```

**Result in UI:**

```
┌──────────────────────────────────────┐
│ ◐ Partially Completed (3/4)          │
│ Cat Discovery Reward System          │
│ [████████░░░░░] 75%                  │
│                                      │
│ SUMMARY                              │
│ Added most of the discovery reward   │
│ system.                              │
│                                      │
│ CHANGES (4)                          │
│ ✓ Created CatFindRewardScript        │
│ ✓ Added detection radius             │
│ ✓ Added one-time reward protection   │
│ ✓ Added VFX and SFX                  │
│                                      │
│ VERIFICATION (2)                     │
│ ✓ Script exists and loads            │
│ ✓ Reward mechanics work              │
│                                      │
│ ⚠ ISSUES (1)                         │
│ Could not update movement speed      │
│ Target: Workspace...WanderScript     │
│ Reason: Studio stopped responding    │
│                                      │
│ NEXT ACTION                          │
│ Reconnect to Studio and retry the    │
│ movement-speed update.               │
│                                      │
│ ▸ Technical Details · 8 tools   [Retry]
└──────────────────────────────────────┘

The discovery reward system is mostly done...
```

## Status Reference

| Status | Icon | Use When | Retry? |
|--------|------|----------|--------|
| completed | ✓ | All steps successful | No |
| partial | ◐ | Some steps failed | Yes |
| failed | ✕ | Overall failure | Yes |
| blocked | ⏸ | Waiting for input | Yes |
| cancelled | ⏹ | User cancelled | No |
| in_progress | ◉ | Still running | No |

## Tool Card Behavior

### Default (Collapsed)

Shows only:
- Tool name (formatted)
- Status icon
- Duration (if available)

```
▶ Get Script · 145ms
▶ Edit Script · 320ms
▶ Create Script · 210ms
```

### Expanded

Shows:
- Tool name
- Status
- Duration
- Input parameters
- Output/result
- Error (if failed)

```
▼ Edit Script · 320ms
  Input
  {
    "path": "ServerScriptService.RewardScript",
    "content": "local..."
  }
  
  Output
  {
    "success": true,
    "message": "Script updated"
  }
```

## Live Progress Display

For tasks that take time, show real-time progress:

```typescript
import { LiveProgressIndicator } from "@/components/ui/live-progress-indicator";

// In message stream while task is running:
<LiveProgressIndicator
  title="Building Pet System"
  steps={[
    { id: "1", title: "Create PetService", status: "completed" },
    { id: "2", title: "Add adoption logic", status: "in_progress" },
    { id: "3", title: "Create UI", status: "pending" },
    { id: "4", title: "Save configuration", status: "pending" }
  ]}
/>
```

Result:
```
Building Pet System
[████░░░░░░░░░░░░] 25%

✓ Create PetService
◉ Add adoption logic (spinning)
○ Create UI
○ Save configuration
```

## Integration Points

### Chat Store (Already Integrated)

```typescript
import { useChatStore } from "@/stores/chat";

// Add message with execution result
useChatStore.addMessage({
  role: "assistant",
  content: "...",
  executionResult: { ... },
  toolCalls: [ ... ]
});

// Update tool call with duration
useChatStore.updateToolCall(messageId, toolCallId, {
  status: "complete",
  result: { ... },
  duration: Date.now() - startTime
});
```

### Execution Result Data Shape

```typescript
interface ExecutionResult {
  taskId?: string;
  status: "completed" | "partial" | "failed" | "blocked" | "cancelled" | "in_progress";
  title: string;
  summary: string;
  progress?: { completed: number; total: number };
  changes?: string[];
  verification?: string[];
  issues?: ExecutionIssue[];
  nextAction?: string;
}

interface ExecutionIssue {
  stepId?: string;
  message: string;
  reason?: string;
  retryable?: boolean;
  target?: string;
}
```

## Tips for Best Results

### ✓ Do This

- **Be specific in changes**: "Created RewardScript in Workspace.RoamingCat" (not just "Created script")
- **List verification steps**: Show what was checked to confirm success
- **Group related changes**: "Added VFX and SFX" (not separate items)
- **Provide actionable next actions**: "Reconnect Studio and retry" (not just "Failed")
- **Use progress when you know totals**: progress: { completed: 3, total: 5 }
- **Set retryable on fixable issues**: If user can retry, set retryable: true

### ✗ Don't Do This

- **Huge change lists**: If 50+ changes, summarize in groups
- **Vague summaries**: "Something was added" (be specific)
- **Silent failures**: Always populate issues[] if anything failed
- **No progress info**: If multi-step, include progress
- **Repeat in content**: "Summary" section and message content say different things

## Styling Customization

All components use semantic CSS classes. No hardcoded colors.

### Theme Tokens Used

- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary text
- `bg-card` - Card backgrounds
- `bg-muted` - Muted areas
- `border-current/20` - Borders
- Status-specific: `text-emerald-600 dark:text-emerald-400` (for success)

To customize, update your theme CSS and all components will adapt.

## Performance Notes

- Tool cards collapsed by default → faster initial render
- Technical details lazy-loaded → less initial DOM size
- Granular state updates → no full chat re-render on tool update
- No performance regression vs previous version

## Troubleshooting

**Q: ExecutionResultCard not showing**
A: Check that message has `executionResult` property populated

**Q: Tool cards not appearing**
A: Check that message has `toolCalls` array populated

**Q: Status badge shows wrong status**
A: Verify ExecutionResult.status matches one of: completed, partial, failed, blocked, cancelled, in_progress

**Q: Changes section is empty**
A: Set `changes: ["...", "..."]` array in ExecutionResult

**Q: Mobile layout looks broken**
A: All components are responsive. Check browser width < 640px for mobile view.

## Component APIs

### ExecutionResultCard
```typescript
<ExecutionResultCard 
  result={executionResult}
  toolCallCount={7}
  onRetry={() => { ... }}
  className="mb-3"
/>
```

### ToolActivityGroup
```typescript
<ToolActivityGroup 
  toolCalls={message.toolCalls}
  groupTitle="Building Pet System"
  className="mb-3"
/>
```

### LiveProgressIndicator
```typescript
<LiveProgressIndicator 
  title="Pet System Build Progress"
  steps={stepsArray}
  className="mb-4"
/>
```

### ExecutionStatusBadge
```typescript
<ExecutionStatusBadge 
  status="completed"
  compact={true}
/>
```

## Next Steps

1. **Use ExecutionResult in agent code**: Start populating when completing tasks
2. **Connect to TaskPanel**: Link ExecutionResult status to task status
3. **Add Retry Handler**: Wire onRetry callback to re-run failed steps
4. **Live Progress**: Integrate LiveProgressIndicator into streaming chat
5. **Export Results**: Add save/export functionality for execution results
