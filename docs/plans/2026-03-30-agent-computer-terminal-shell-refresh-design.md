# Agent's Computer Terminal Shell Refresh

## Context

The shared `TabChat.tsx` terminal inside `Agent's Computer` felt visually detached from the rest of the shell. The log used the page background, had no obvious bounded terminal surface, and rendered its command prompt as a footer pinned to the bottom of the workspace instead of as part of the terminal itself.

The create-flow provisioning screen already had a stronger terminal language: dark bounded shell, clear header chrome, and one cohesive surface. This refresh reuses that direction for the shared terminal workspace without changing the surrounding tab layout.

## Chosen Approach

Keep the existing `Agent's Computer` tabs and only restyle the terminal pane itself.

- Render the terminal as one dark, bounded shell inside the workspace pane.
- Keep the scrollable command history and the interactive prompt inside that shell.
- Reuse provisioning-terminal visual cues: traffic-light chrome, dark palette, monospace status labels.
- Preserve the existing behavior and copy where possible so test churn stays low.

## Why This Approach

This is the lowest-risk way to fix the specific UX issue:

- it addresses the disconnected prompt directly
- it makes the terminal feel intentionally sized even when the workspace is tall
- it improves both builder and deployed-agent chat because they already share `TabChat.tsx`
- it avoids reworking unrelated workspace tabs or create-flow routing

## Implementation Notes

- Primary code change: `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx`
- Regression coverage: `agent-builder-ui/e2e/tab-chat-terminal.spec.ts`
- Documentation: `docs/knowledge-base/specs/SPEC-agent-computer-terminal-shell.md`

## Verification

- `cd agent-builder-ui && npx tsc --noEmit`
- `cd agent-builder-ui && npx playwright test e2e/tab-chat-terminal.spec.ts --grep "shows tool step and terminal command for <function=> tool call"`
