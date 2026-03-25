# SPEC: Deployed Chat Browser Workspace

[[000-INDEX|← Index]] | [[008-agent-builder-ui]] | [[011-key-flows]]

## Status

implemented

## Summary

The deployed-agent chat page now treats browser activity as a first-class workspace surface instead of inferring everything from assistant prose. The first shipped slice accepts structured browser SSE frames on the existing sandbox chat proxy, renders a browser timeline plus preview/screenshot state in the Browser tab, and surfaces operator takeover/resume state for blocked login, CAPTCHA, or similar browser steps.

## Related Notes

- [[004-api-reference]] — documents the chat proxy SSE contract that now carries structured browser workspace frames
- [[008-agent-builder-ui]] — owns the deployed-agent Browser tab and runtime workspace parsing
- [[011-key-flows]] — describes how browser events move from the sandbox chat stream into the operator workspace

## Specification

### Transport Contract

- The existing `POST /api/sandboxes/:sandbox_id/chat` SSE response remains the transport for deployed-agent browser workspace events.
- Browser workspace frames are top-level JSON objects in the stream with either a `browser` or `browser_event` object.
- The backend proxy does not reinterpret these frames; it must preserve them unchanged so the deployed-agent UI can fail closed on malformed payloads instead of reconstructing browser state heuristically.

### Supported Browser Event Shapes

The first slice supports these event types:

- `navigation`
  - fields: `url`, optional `label`, optional `detail`
  - effect: appends a timeline row and updates the visible browser history
- `action`
  - fields: `label`, optional `detail`, optional `url`
  - effect: appends an operator-readable action row such as click, type, or submit
- `screenshot`
  - fields: `url`, optional `label`
  - effect: appends a screenshot artifact row and makes the screenshot visible in the Browser timeline
- `preview`
  - fields: `url`, optional `label`
  - effect: updates the Browser tab live-preview iframe target
- `takeover_requested`
  - fields: optional `reason`, optional `actionLabel`
  - effect: shows a takeover-needed banner in the Browser tab
- `takeover_resumed`
  - fields: optional `reason`, optional `actionLabel`
  - effect: marks takeover as resumed and clears the urgent blocked state

Unknown browser event types are ignored.

### UI Contract

- `TabChat.tsx` keeps Browser workspace state scoped to the active conversation/run.
- Completed assistant messages may retain a `browserState` snapshot so the Browser tab can still show timeline state after the stream ends.
- The Browser tab shows:
  - timeline entries for navigation, actions, screenshots, and preview announcements
  - the latest preview URL in the existing preview iframe mode when available
  - a takeover banner when the runtime reports `takeover_requested`
  - a local operator resume action that marks the takeover state as resumed for the current run

### Fallback Behavior

- When structured browser frames are absent, the client may still derive best-effort browser items from markdown images, URLs, and localhost preview announcements.
- Structured browser frames are the preferred contract; heuristic parsing is fallback only and should not be extended as the primary path for future browser work.

### Out Of Scope For This Slice

- Full browser replay/video archives
- Live remote browser control from the operator UI
- Persisting browser workspace snapshots through the backend conversation store
- Backend-side normalization or validation of browser frames beyond preserving the raw SSE stream

## Implementation Notes

- Added `agent-builder-ui/lib/openclaw/browser-workspace.ts` as the canonical browser-workspace event parser/state helper.
- Updated `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` to consume structured browser frames and store per-message browser workspace snapshots.
- Updated `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx` to render action/navigation rows, preview mode, and takeover banners/actions.
- The backend chat proxy in `ruh-backend/src/app.ts` already satisfied the transport requirement by piping upstream SSE directly; no route-shape change was required for this first slice.

## Test Plan

- Unit: `bun test agent-builder-ui/lib/openclaw/browser-workspace.test.ts`
- Integration sanity: `npx tsc --noEmit --pretty false` in `agent-builder-ui`
  - current repo-wide typecheck still fails on pre-existing unrelated test/config issues, so verify that no `TabChat`, `BrowserPanel`, or `browser-workspace` errors are reported
- Optional browser regression: extend `agent-builder-ui/e2e/tab-chat-terminal.spec.ts` with a mocked structured-browser-event scenario when the local Playwright harness is available
