# SPEC: Create-Flow Static Workspace Tabs

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-copilot-config-workspace]]

## Status

implemented

## Summary

The `/agents/create` Co-Pilot workspace should stay on the operator-selected tab while the builder is active. During create flow, runtime tool activity must no longer auto-switch the workspace to terminal, code, browser, or preview; only explicit user tab clicks should change the active workspace surface.

## Related Notes

- [[008-agent-builder-ui]] — the Co-Pilot builder workspace and `TabChat` focus behavior live here
- [[011-key-flows]] — the create-agent walkthrough describes the operator-visible workspace contract
- [[SPEC-copilot-config-workspace]] — this adjusts the earlier builder-aware auto-focus rules for the create-flow UX

## Specification

### Goal

Keep the create-agent Co-Pilot workspace static so the operator can read and approve builder output without the UI jumping to runtime tabs.

### Scope

This applies to `/agents/create` while Co-Pilot/builder mode is active.

It does not change deployed-agent chat behavior or the set of tabs available in the workspace.

### Workspace Tab Contract

In create flow:

- the initial active workspace tab may still start on `Config`
- explicit operator tab clicks remain authoritative
- runtime tool activity must not auto-switch the workspace to `terminal`, `code`, `browser`, or `preview`
- preview-server detection must not auto-switch the workspace to `preview`
- browser workspace events must not auto-switch the workspace to `browser`
- Co-Pilot stage changes must not force the workspace back to `Config` once the operator is already in the workspace

The workspace becomes fully user-controlled for the duration of the create flow.

### Non-goals

- do not remove any runtime tabs from the workspace
- do not change deployed-agent chat auto-switch behavior
- do not change the underlying tool/browser/preview data capture; only the active-tab focus policy changes

## Implementation Notes

- Extract the tab auto-switch policy from `TabChat.tsx` into a small pure helper so builder-vs-agent behavior can be tested without rendering the full chat shell.
- Builder mode should treat every auto-switch trigger as disabled while preserving manual tab selection.
- Existing agent/deployed chat should keep the current runtime auto-switch behavior.

## Test Plan

- Add focused unit coverage for the extracted workspace auto-switch policy:
  - builder mode suppresses tool/browser/preview/phase auto-switch reasons
  - non-builder mode still allows the existing runtime auto-switch reasons
- Run the relevant `bun test` target for the new policy test plus the existing lifecycle-stage coverage.
- Run `npx tsc --noEmit` for `agent-builder-ui`.
