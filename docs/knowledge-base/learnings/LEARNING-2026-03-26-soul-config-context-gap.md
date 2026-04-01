# LEARNING: SOUL and review test chat must share the saved config contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[SPEC-pre-deploy-agent-testing]]

## Context

The Google Ads creation lane now persists truthful `toolConnections[]` and `triggers[]`, and Review/Deploy surfaces show that state directly. The review-phase "Test Agent" loop is supposed to validate the same in-progress agent contract before deployment, using `buildSoulContent(...)` to inject the current review snapshot into an isolated `agent:test:*` session.

## What Was Learned

The original gap was that review-test and runtime prompt generation dropped saved config state that the product already knew:

- `ReviewAgent.tsx` built `reviewAgentSnapshot` without `toolConnections` or structured `triggers`
- `buildSoulContent()` only serialized name, description, skills, rules, and the flattened legacy `triggerLabel`
- `pushAgentConfig()` reused that same SOUL builder for deploy-time `soul_content`

The durable contract after the fix is:

- Review's isolated `Test Agent` snapshot carries persisted `toolConnections[]`, structured `triggers[]`, and accepted improvements forward into `buildSoulContent()`
- `buildSoulContent()` emits one safe config-context summary shared by review-mode testing and deploy-time `SOUL.md` writes
- Secret-bearing summary details such as tokens and callback URLs are stripped before prompt injection, while operator-relevant status such as `configured`, `missing_secret`, `supported`, and `manual plan only` remains visible to the model

## Evidence

- [`agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/review/ReviewAgent.tsx) now exports one review snapshot builder that carries persisted tool and trigger metadata into the test-only `SavedAgent` payload
- [`agent-builder-ui/lib/openclaw/agent-config.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/agent-config.ts) now adds a `Configured Tools And Triggers` section and strips sensitive summary items before prompt generation
- `cd agent-builder-ui && bun test 'lib/openclaw/agent-config.test.ts' 'app/(platform)/agents/create/_components/review/ReviewAgent.test.ts'` passed on March 26, 2026 with 7 tests and 0 failures

## Implications For Future Agents

- Treat SOUL generation as part of the saved-config truthfulness contract, not as a separate prompt-only helper
- When Review, Improve Agent, or Deploy gain new persisted config state, update the shared SOUL summary and the review snapshot builder together
- Keep browser-visible test prompts sanitized: preserve readiness state and safe summaries, but never inject secret-bearing details just because they exist in a saved connector summary

## Links

- [[008-agent-builder-ui]]
- [[SPEC-pre-deploy-agent-testing]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-26.md)
