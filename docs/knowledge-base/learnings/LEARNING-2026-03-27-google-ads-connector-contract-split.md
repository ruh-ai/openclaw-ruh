# LEARNING: Google Ads connector contract is split between backend runtime and frontend builder

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[004-api-reference]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the active focus still pointed at the Google Ads proving case. The current repo looked inconsistent: several recently shipped frontend tasks had normalized Google Ads builder intent onto Google Workspace or a manual-plan card, but the backend and KB already exposed a real `google-ads` runtime surface.

## What Was Learned

The repo already has meaningful direct Google Ads support in the backend, but the operator-facing builder path still behaves as if Google Ads lacks a direct connector.

- `ruh-backend/src/app.ts` provisions `google-ads` into `.openclaw/mcp.json` via `@anthropic/google-ads-mcp` during `configure-agent`.
- `docs/knowledge-base/004-api-reference.md` documents the credential summary and encrypted credential write routes with `toolId: "google-ads"` examples.
- `ruh-backend/tests/unit/agentCredentialsApp.test.ts` verifies those credential routes using Google Ads credential keys.
- `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts` still omits `google-ads`, and `agent-builder-ui/lib/openclaw/builder-hint-normalization.ts` rewrites `"google ads"` to `google`.
- Multiple frontend tests and fixtures still assume `google-ads` is the proving-case connector identity, so the repo is carrying two competing contracts at once.

## Evidence

- [`ruh-backend/src/app.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/src/app.ts)
- [`ruh-backend/tests/unit/agentCredentialsApp.test.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh-backend/tests/unit/agentCredentialsApp.test.ts)
- [`docs/knowledge-base/004-api-reference.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/004-api-reference.md)
- [`agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts)
- [`agent-builder-ui/lib/openclaw/builder-hint-normalization.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/builder-hint-normalization.ts)
- [`agent-builder-ui/e2e/create-agent.spec.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/e2e/create-agent.spec.ts)

## Implications For Future Agents

- Do not assume the Google Workspace fallback is the truthful long-term contract for the Google Ads proving case.
- Treat this as a current frontend/backend contract split that should be resolved by promoting `google-ads` through the builder flow, not by adding more remap logic on top of it.
- When touching AG-UI hint normalization, Connect Tools, Review/Deploy summaries, or draft persistence, keep `google-ads` and `google` as distinct connector identities unless the user intent is genuinely Workspace-specific.

## Resolution Update

The `Worker-1` automation run later on 2026-03-27 closed this split for the primary builder path.

- `agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts` now defines a direct `google-ads` connector with Google Ads credential fields.
- `agent-builder-ui/lib/openclaw/builder-hint-normalization.ts` now preserves explicit Google Ads intent as `google-ads` while still keeping Workspace-specific intent on `google`.
- `agent-builder-ui/app/(platform)/agents/create/_components/configure/connect-tool-catalog.ts`, `create-session-config.ts`, and `lib/openclaw/ag-ui/builder-metadata-autosave.ts` now keep Google Ads recommendations, accepted improvements, and reopen state on the same `google-ads` identity instead of rewriting them onto Workspace.

Future work in this lane should build on the direct `google-ads` contract rather than reintroducing remap behavior.

## Links

- [[008-agent-builder-ui]]
- [[004-api-reference]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
