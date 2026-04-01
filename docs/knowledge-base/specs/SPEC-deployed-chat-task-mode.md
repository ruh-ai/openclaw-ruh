# SPEC: Manus-style Task Management Mode + Code Editor View

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[011-key-flows|Key Flows]]

## Status
<!-- draft | approved | implemented | deprecated -->
implemented

## Summary

Adds Manus-style task decomposition, a syntax-highlighted Code Editor tab, and intelligent auto-switching to the deployed-agent chat workspace at `/agents/[id]/chat`. The agent can break a problem into numbered subtasks that render as a live progress panel, while the right-side "Agent's Computer" now has four tabs (Terminal, Code, Files, Browser) that switch automatically based on what tool the agent is using.

## Related Notes
- [[008-agent-builder-ui]] — The agent builder UI architecture this feature extends
- [[011-key-flows]] — End-to-end user journeys through the deployed-agent chat
- [[004-api-reference]] — Workspace file API used by the Code Editor auto-discovery
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — Files workspace that the Code tab complements

## Specification

### 1. Task Plan System

**Stream format:** The agent outputs a `<plan>` XML block in its streamed response:

```
<plan>
- [ ] Research API docs
- [ ] Design data model
- [ ] Implement endpoints
</plan>
```

As the agent completes tasks, it emits `<task_update>` tags:

```
<task_update index="0" status="done"/>
```

**Fallback:** If no `<plan>` block is present, the parser also recognizes standard markdown checkbox lists (`- [ ]` / `- [x]`) with 2+ items.

**Data model:**

```typescript
interface TaskPlanItem {
  id: number;
  label: string;
  status: "pending" | "active" | "done";
  children?: TaskPlanItem[];   // one level of nesting via 2-space indent
}

interface TaskPlan {
  items: TaskPlanItem[];
  currentTaskIndex: number;    // first non-done top-level item
  totalTasks: number;          // flat count including children
}
```

**UI:** `TaskPlanPanel` renders inside the assistant message bubble with:
- Numbered items with checkbox indicators (empty circle / animated pulse / green checkmark)
- Progress bar and `done/total` counter
- Collapsible in historical messages
- Nested subtask support

**Tag stripping:** `<plan>` blocks and `<task_update>` tags are stripped from the displayed message content via `stripPlanTags()`.

### 2. Code Editor Tab

**Component:** `CodeEditorPanel` — the fourth tab in ComputerView.

**Features:**
- Syntax highlighting for JS/TS, Python, HTML, CSS, JSON, Markdown, Shell (token-based, lightweight)
- Line numbers in left gutter
- File tabs at top for recently touched files (closable)
- Mini file tree sidebar when multiple files exist
- File path breadcrumb with language badge
- Dark theme matching the workspace `#0d0d0d` background
- Auto-scroll to bottom as content streams in

**File loading — two paths:**
1. **Streaming detection:** When the SSE stream contains structured `file_write` tool events, the parser extracts the file path and fetches content from `GET /api/sandboxes/:id/workspace/file?path=<path>`.
2. **Auto-discovery:** When the Code tab is opened and no files were detected from streaming, the component fetches `GET /api/sandboxes/:id/workspace/files` and loads any code files found in the session.

**Empty state:** Shows `</>` icon with "No files edited yet — Files will appear here as the agent writes code."

### 3. ComputerView Enhancement

**Tabs:** Terminal | Code | Files | Browser (was: Terminal | Files | Browser)

**Header:** Renamed from "Agent's Workspace" to "Agent's Computer". Shows `TaskProgressHeader` with:
- Row of mini dots (green=done, pulsing=active, dim=pending)
- "Task N of M" text counter
- Current task label (truncated)

### 4. Auto-Switch Logic

The workspace auto-switches tabs based on detected tool types:

| Tool names | Tab |
|---|---|
| `exec`, `bash`, `shell_exec`, `shell`, `terminal`, `run`, `sh` | Terminal |
| `file_write`, `write_file`, `file_str_replace`, `str_replace_editor`, `create_file` | Code |
| `browser_navigate`, `browser_click`, `browser_input`, `browser_scroll`, etc. | Browser |

**Safeguards:**
- 500ms debounce between auto-switches
- Manual tab click overrides auto-switch for 5 seconds
- Active editor file change triggers Code tab switch

## Implementation Notes

### Files created
| File | Purpose |
|---|---|
| `lib/openclaw/task-plan-parser.ts` | Pure parsing functions for plan blocks, checkbox lists, task updates |
| `lib/openclaw/task-plan-parser.test.ts` | 26 unit tests (bun:test) |
| `_components/TaskPlanPanel.tsx` | Task plan UI component |
| `_components/TaskProgressHeader.tsx` | Progress indicator for ComputerView header |
| `_components/CodeEditorPanel.tsx` | Code editor with syntax highlighting, file tabs, auto-discovery |
| `e2e/tab-chat-task-plan.spec.ts` | 10 E2E tests (Playwright) |

### Files modified
| File | Changes |
|---|---|
| `_components/TabChat.tsx` | Task plan state/parser, code editor state, ComputerView 4-tab + auto-switch, TaskPlanPanel in message bubbles |
| `package.json` | Added CodeMirror 6 dependencies (view, state, language, lang-*, theme-one-dark) |

### Key patterns
- Task plan parsed from delta accumulator (`taskPlanFullTextRef`) separate from the phase state machine
- `planClosedRef` tracks whether the `<plan>` block is fully closed to avoid re-parsing finalized plans
- Code editor uses workspace file API auto-discovery as fallback when SSE stream doesn't emit structured tool events
- Auto-switch uses `userTabClickRef` timestamp to respect manual tab selections

## Test Plan

### Unit tests (26 passing)
- Plan block parsing (complete, partial, nested, empty, uppercase checkmarks)
- Markdown checkbox fallback
- Task update extraction and application
- Plan tag stripping
- Immutability of update operations

### E2E tests (10 passing)
1. Task plan renders from `<plan>` block in SSE stream
2. Task items update to done via `<task_update>` tags
3. Task progress shows in ComputerView header ("Task N of M")
4. Markdown checkbox fallback renders plan
5. Code tab is visible in ComputerView tabs
6. Code editor shows empty state when no files edited
7. Code editor shows file content on file_write tool event
8. Auto-switches to browser tab on browser tool
9. ComputerView header shows "Agent's Computer" label
10. Plan XML tags are stripped from displayed message content

### Visual verification
- Live agent interaction confirmed: agent writes `fib.py`, Code tab auto-discovers and renders it with full syntax highlighting
