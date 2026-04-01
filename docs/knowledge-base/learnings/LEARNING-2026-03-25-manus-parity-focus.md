# LEARNING: Manus parity focus should target the deployed-agent workspace, not generic chat polish

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-agent-learning-and-journal]]

## Context

The repo's `docs/project-focus.md` was still effectively empty even though the current priority is to move the deployed-agent chat experience toward Manus-style capability parity. The user explicitly pointed to `http://localhost:3000/agents/cd90b647-291a-424f-b81e-afa660580819/chat` and asked for the focus document to spell out browser use, code use, editor use, terminal use, and related Manus features in a way that another agent can act on directly.

## What Was Learned

The right steering scope is not "make the builder more like Manus" in the abstract. It is the deployed-agent chat workspace specifically.

Current local evidence:

- the target page already has an `Agent's Workspace`
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` currently hardcodes only `terminal` and `thinking` tabs
- the gap is therefore a missing multi-surface workspace, not a missing chat surface

Current Manus capability baseline from official docs:

- browser operation in both a cloud browser and a local/browser-operator mode
- conversational editing plus visual editing and live preview
- direct code control and full code export/download
- built-in auth/access control and app productization features
- MCP connectors and multi-tool workflows
- persistent projects/workspaces
- wide research plus non-chat outputs like slides, dashboards, reports, and webpages

This means future analyst tasks should prioritize operator-visible workspace capabilities on `/agents/[id]/chat`, not generic assistant polish elsewhere in the app.

## Evidence

- Local UI inspection of `http://localhost:3000/agents/cd90b647-291a-424f-b81e-afa660580819/chat` showed `Agent's Workspace` with only `terminal` and `thinking`.
- `agent-builder-ui/app/(platform)/agents/[id]/chat/_components/TabChat.tsx` sets `useState<"terminal" | "thinking">("terminal")`.
- Official Manus docs used for the focus baseline:
  - [Cloud browser](https://manus.im/docs/features/cloud-browser)
  - [Manus Browser Operator](https://manus.im/docs/integrations/manus-browser-operator)
  - [Editing and Previewing](https://manus.im/docs/website-builder/editing-and-previewing)
  - [Code Control](https://manus.im/docs/website-builder/code-control)
  - [Access Control](https://manus.im/docs/website-builder/access-control)
  - [MCP Connectors](https://manus.im/docs/integrations/mcp-connectors)
  - [Projects](https://manus.im/docs/features/projects)
  - [Wide Research](https://manus.im/docs/features/wide-research)
  - [Data Analysis & Visualization](https://manus.im/docs/features/data-visualization)
  - [Publishing](https://manus.im/docs/website-builder/publishing)
  - [Project Analytics](https://manus.im/docs/website-builder/project-analytics)

## Implications For Future Agents

- Treat `/agents/[id]/chat` as the primary product surface for Manus-style parity work until this focus changes.
- Prefer feature packages that add a visible browser, files/editor, artifact, connector, or productization capability to the deployed-agent workspace.
- Do not spend this focus budget on pixel-perfect Manus cloning or unrelated dashboard polish.
- When scoping work, start from the existing `terminal` + `thinking` workspace and ask what operator capability is still missing for a Manus-like end-to-end workflow.

## Links
- [[008-agent-builder-ui]]
- [[SPEC-analyst-project-focus]]
- [[SPEC-feature-at-a-time-automation-contract]]
- [Journal entry](../../journal/2026-03-25.md)
