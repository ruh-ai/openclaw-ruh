# LEARNING: Deployed-agent chat browser workspace is heuristic-only

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The active `docs/project-focus.md` prioritizes Manus-style workspace parity on the deployed-agent chat page, with browser visibility plus takeover listed as the first recommended delivery slice. A fresh review of the current deployed-chat implementation showed that the repo has moved past a literal “no browser tab” state, but it still has not established a trustworthy browser-workspace contract.

## What Was Learned

Future parity work should treat the current Browser tab as a prototype driven by heuristic text parsing, not as a finished browser-workspace contract.

Current repo evidence:

- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` now hardcodes the workspace tabs to `terminal`, `browser`, and `thinking`, and imports `BrowserPanel`.
- That same file populates browser state through `processForBrowser()`, which scrapes markdown images, URLs, and localhost port announcements from streamed assistant text instead of consuming structured browser events.
- `BrowserPanel.tsx` can render screenshots, URLs, and a preview iframe, but it still depends on that heuristic text-derived item list.
- `ruh-backend/src/app.ts` forwards deployed-chat SSE without defining any browser-specific event normalization or takeover metadata for the deployed-agent chat path.
- `agent-builder-ui/e2e/tab-chat-terminal.spec.ts` still covers parser behavior and terminal visibility only, so the shipped browser surface is not yet protected as a real runtime contract.

## Evidence

- `docs/project-focus.md` still says the suggested delivery order starts with browser visibility plus takeover, followed by files/editor, then richer terminal/process state.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sets `useState<"terminal" | "thinking" | "browser">("terminal")` inside `ComputerView`.
- The same file's `processForBrowser()` function derives browser state from markdown image links, navigation prose, and localhost port mentions.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/BrowserPanel.tsx` renders screenshots/URLs/preview UI but only from those parsed `BrowserItem[]` values.
- `ruh-backend/src/app.ts` still exposes no browser-event normalization layer for deployed chat.

## Implications For Future Agents

- Do not scope future browser work as “add a browser tab”; that tab already exists and the real gap is the absence of a structured browser-workspace contract.
- Reuse the existing deployed-chat workspace shell in `TabChat.tsx` rather than redesigning the page, but replace heuristic text scraping with explicit runtime telemetry.
- Keep browser, terminal/process, and files/artifacts on one shared workspace model so later parity slices do not each invent their own parsing pipeline.
- When prioritizing the next focus-aligned package, account for the current code reality: browser visibility is partially prototyped, while structured terminal/process state and terminal-to-file navigation remain completely undocumented and untracked.

## Links
- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-analyst-project-focus]]
- [Journal entry](../../journal/2026-03-25.md)
