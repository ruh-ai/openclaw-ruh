# LEARNING: Google Ads customer ID must stay on the runtime-input side of the contract

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[004-api-reference]] | [[008-agent-builder-ui]] | [[SPEC-google-ads-agent-creation-loop]]

## Context

During the 2026-03-27 `Analyst-1` backlog-curation run, the Google Ads proving-case lane was re-checked against the current KB, `TODOS.md`, and the live create-flow code to find one non-duplicate missing feature package. The repo already documented a clean split between encrypted connector credentials and non-secret runtime inputs, so the inspection focused on whether the shipped UI still honored that boundary.

## What Was Learned

`GOOGLE_ADS_CUSTOMER_ID` is still split across two incompatible product contracts: the KB and runtime-input helpers treat it as a non-secret runtime input, while the Google Ads direct-connector form still asks for it as an encrypted credential.

- The durable contract should stay simple: OAuth secrets and developer tokens belong in the credential path, while Customer ID belongs in `runtimeInputs[]`.
- When a non-secret account identifier appears in both places, operators get two conflicting entry points and the builder can misstate connector readiness.
- Future connector work should treat this as a general rule, not a one-off Google Ads quirk: secret-bearing auth material lives in encrypted credential storage; operator-visible account or tenant identifiers live in runtime inputs.

## Implementation Follow-through

Worker-1 closed the first contract-cleanup slice on 2026-03-27:

- `mcp-tool-registry.ts` now excludes `GOOGLE_ADS_CUSTOMER_ID` from the Google Ads encrypted credential fields.
- `ConnectToolsSidebar.tsx` now enables Google Ads credential save based only on the remaining secret-bearing fields and shows explicit guidance directing operators to Runtime Inputs for the customer id.
- `runtime-inputs.ts` now labels the proving-case field as `Google Ads Customer ID`, which keeps the runtime-input surface unambiguous after the duplicate credential field was removed.

## Evidence

- [`agent-builder-ui/lib/agents/runtime-inputs.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/lib/agents/runtime-inputs.ts) already defines `GOOGLE_ADS_CUSTOMER_ID` as a first-class runtime input with operator-facing label and description.
- [`agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_config/mcp-tool-registry.ts) now keeps the Google Ads encrypted credential list secret-only and exports runtime-input guidance for non-secret values.
- [`agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/agent-builder-ui/app/(platform)/agents/create/_components/configure/ConnectToolsSidebar.tsx) now computes Google Ads save-enable state from those secret-only fields and tells operators to fill `GOOGLE_ADS_CUSTOMER_ID` in Runtime Inputs instead.
- [`docs/knowledge-base/004-api-reference.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/004-api-reference.md) and [`docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md`](/Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/docs/knowledge-base/specs/SPEC-google-ads-agent-creation-loop.md) explicitly say non-secret values such as `GOOGLE_ADS_CUSTOMER_ID` should remain on the runtime-input contract rather than the credential endpoints.

## Implications For Future Agents

- Do not add non-secret account identifiers to connector credential forms just because they are required for a connector to run.
- When a connector needs both secrets and operator-visible runtime values, keep the split explicit: secrets in encrypted credential storage, account ids in `runtimeInputs[]`.
- If connector readiness depends on both sides of that split, make the UI explain the dependency without storing the non-secret value in the credential channel.

## Links

- [[004-api-reference]]
- [[008-agent-builder-ui]]
- [[SPEC-google-ads-agent-creation-loop]]
- [Journal entry](../../journal/2026-03-27.md)
