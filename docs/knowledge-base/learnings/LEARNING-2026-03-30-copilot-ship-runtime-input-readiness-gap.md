# LEARNING: Co-Pilot Ship activation must share backend runtime-input enforcement

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]] | [[011-key-flows]] | [[SPEC-agent-builder-gated-skill-tool-flow]]

## Context

On 2026-03-30, the linked forge-backed draft at `/agents/create?agentId=7653519b-c9cb-4269-a70c-5a94f2158a6d` still errored during Ship-stage activation even after the build-stage `skill_md` handoff bug was fixed. Browser repro plus direct backend inspection showed the agent still had blank required runtime inputs (`HELPDESK_API_KEY`, `SLACK_WEBHOOK_URL`) and the frontend Ship path was treating that state inconsistently.

## What Was Learned

- Backend `POST /api/sandboxes/:sandbox_id/configure-agent` is already the source of truth for required runtime inputs. If a required `runtime_inputs[]` entry is blank, config apply returns `400` with explicit `runtime_env` step failures.
- The frontend must honor that same rule before activation. Treating missing required runtime inputs as advisory-only in Co-Pilot deploy readiness guarantees a false-positive Ship path.
- Ship activation has two distinct truth contracts:
  - readiness truth: block activation until required runtime inputs and selected skills are deployable
  - completion truth: a forge Ship only succeeds when `pushAgentConfig()` returns `ok: true`, not merely when the draft save succeeded
- When the completion callback is fire-and-forget and its failed config-push result is ignored, the Ship UI can progress into a success-looking state even though the backend rejected activation.

## Evidence

- [`agent-builder-ui/lib/openclaw/copilot-flow.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/openclaw/copilot-flow.ts) now blocks deploy when any required runtime-input key remains blank instead of treating missing runtime inputs as advisory.
- [`agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/copilot/LifecycleStepRenderer.tsx) now disables Ship-stage `Save & Activate` under that same readiness contract and awaits the completion result instead of blindly marking save as done.
- [`agent-builder-ui/app/(platform)/agents/create/page.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/page.tsx) now treats `pushAgentConfig().ok === false` as a real activation failure and surfaces the returned detail.
- Direct repro against the linked agent confirmed the backend failure shape: `400 Missing required runtime inputs: HELPDESK_API_KEY, SLACK_WEBHOOK_URL`.

## Implications For Future Agents

- Keep frontend deploy-readiness logic aligned with backend config-apply enforcement. If the backend rejects a missing prerequisite, the primary CTA must fail closed on that same prerequisite.
- Do not treat `pushAgentConfig()` as best-effort inside the create-flow Ship stage. For forge-backed activation, a failed config push is a failed ship.
- When adding new deploy blockers, wire the same contract into both the page-level CTA and any embedded stage-specific CTA so they cannot drift.

## Links

- [[008-agent-builder-ui]]
- [[011-key-flows]]
- [[SPEC-agent-builder-gated-skill-tool-flow]]
- [[LEARNING-2026-03-27-agent-runtime-env-requirements-gap]]
- [Journal entry](../../journal/2026-03-30.md)
