# SPEC: Agent's Computer Terminal Shell

[[000-INDEX|← Index]] | [[008-agent-builder-ui|Agent Builder UI]] | [[SPEC-copilot-config-workspace|Co-Pilot Config Workspace]]

## Status

implemented

## Summary

The shared `Agent's Computer` terminal should render as a cohesive terminal shell instead of a light page with a detached footer prompt. Command history, terminal status, and manual command entry now live inside one bounded dark surface that matches the create-flow provisioning terminal language.

## Related Notes

- [[008-agent-builder-ui]] — documents the shared `TabChat.tsx` workspace contract used by builder and deployed-agent chat
- [[SPEC-copilot-config-workspace]] — builder Co-Pilot uses the same `Agent's Computer` shell, so terminal polish must not split the workspace contract

## Specification

- Applies to the `Terminal` tab in `Agent's Computer` for both builder and deployed-agent chat, because both surfaces reuse `TabChat.tsx`.
- The terminal renders inside a bounded dark shell with persistent chrome: header, scrollable log body, and embedded footer prompt.
- The command prompt belongs inside that shell when manual execution is available. It must not appear as a page-level footer detached from the terminal body.
- Command entries remain monospace, keep tool/status context, and visually distinguish running versus completed commands.
- The empty state remains truthful (`No commands run yet`) but is presented inside the shell rather than on the page background.

## Implementation Notes

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` owns the shared `TerminalPanel`.
- The shell styling reuses the visual direction of the provisioning terminal from `agent-builder-ui/app/(platform)/agents/create/page.tsx`.
- Added stable test hooks: `workspace-terminal-shell`, `workspace-terminal-log`, and `workspace-terminal-input`.

## Test Plan

- `cd agent-builder-ui && npx tsc --noEmit`
- `cd agent-builder-ui && npx playwright test e2e/tab-chat-terminal.spec.ts --grep "shows tool step and terminal command for <function=> tool call"`
