# LEARNING: Improve Agent still bypasses the shipped Co-Pilot workspace

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]] | [[SPEC-copilot-config-workspace]] | [[SPEC-agent-learning-and-journal]]

## Context

This analyst run re-checked the active Google Ads creation-focus lane after the repo had already added Co-Pilot workspace UI, AG-UI draft autosave, persisted improvement state, saved-config truthfulness, and several create/deploy backlog packages. The goal was to find the single highest-value missing feature package that still was not captured in `TODOS.md`.

## What Was Learned

The existing-agent Improve Agent entry path still does not use the Co-Pilot builder contract that the repo now documents and prioritizes.

- In `agent-builder-ui/app/(platform)/agents/create/page.tsx`, the initial mode is `editingAgentId ? "chat" : "copilot"`, so reopening an existing agent starts in the legacy advanced-chat shell by default.
- The same file hides the mode toggle whenever `existingAgent` is present, so operators cannot switch themselves back into Co-Pilot from that existing-agent path.
- `CoPilotLayout.tsx` already supports an `existingAgent` prop and the saved Google Ads config contract now rehydrates tools, triggers, and improvements, which means the gap is integration and route ownership, not missing underlying data.
- This is now a focus-lane contract mismatch: `docs/project-focus.md` and `[[008-agent-builder-ui]]` both frame Co-Pilot as the main builder workspace, but Improve Agent still bypasses it entirely.

## Evidence

- `agent-builder-ui/app/(platform)/agents/create/page.tsx` initializes mode with `editingAgentId ? "chat" : "copilot"`.
- In the same file, the chat-mode header renders `!existingAgent && <ModeToggle ... />`, which removes the operator's path back to Co-Pilot for existing agents.
- `agent-builder-ui/app/(platform)/agents/page.tsx` routes the `Build` action for saved agents to `/agents/create?agentId=<id>`, so Improve Agent reliably enters through the code path above.
- `agent-builder-ui/app/(platform)/agents/create/_components/copilot/CoPilotLayout.tsx` accepts `existingAgent` and already synthesizes a saved-agent-backed Co-Pilot shell, but the existing-agent route never reaches it.
- `docs/project-focus.md` explicitly calls out improving both `/agents/create` and the existing Improve Agent path, and `[[008-agent-builder-ui]]` describes the Co-Pilot workspace as the main builder experience.

## Implications For Future Agents

- Treat Improve Agent Co-Pilot adoption as its own package rather than assuming create-flow Co-Pilot work already covers existing agents.
- Keep existing-agent completion semantics distinct from new-agent deploy handoff: Improve Agent should still persist edits and hot-push running sandboxes where appropriate.
- When this lands, update builder KB/spec notes so Co-Pilot is described as the Improve Agent contract too, not only the new-agent path.

This gap was addressed later the same day in [[LEARNING-2026-03-26-improve-agent-copilot-contract]], which documents the shipped saved-agent seed and completion split.

## Links

- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [[SPEC-copilot-config-workspace]]
- [[LEARNING-2026-03-26-improve-agent-copilot-contract]]
- [Journal entry](../../journal/2026-03-26.md)
