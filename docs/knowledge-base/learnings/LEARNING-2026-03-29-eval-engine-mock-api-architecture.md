# LEARNING: Eval Engine Mock API Architecture

[[000-INDEX|← Index]] | [[013-agent-learning-system]] | [[008-agent-builder-ui]]

## Context

The create agent wizard's Test stage (Step 5) was fully simulated — eval tasks auto-passed after a 2-second setTimeout with fake responses. Enterprise customers need to evaluate agents before providing real API credentials, which requires a mock API layer.

## What Was Learned

### Mock Mode Is Essential for Enterprise Adoption

Enterprises won't share production API credentials during the agent creation/evaluation phase. The eval system needs two modes:
- **Mock mode** (default): Agent runs against generated mock data that matches real API schemas. No credentials needed.
- **Live mode** (opt-in): Agent runs against real APIs. Requires credentials to be configured.

### Well-Known API Templates Scale Better Than Pure Generation

Instead of relying solely on LLM generation for mock data, pre-built templates for common APIs (Google Ads, Zendesk, Slack) produce more realistic data with correct endpoint paths, field names, and response structures. LLM generation works as a fallback for unknown/custom APIs.

### Heuristic Scoring Works for Eval When Tuned Properly

Keyword-based response scoring is sufficient for the eval stage when:
- Hyphens in identifiers (e.g., `campaign-performance`) are normalized to spaces before matching
- Bigrams are capped to avoid diluting unigram match ratios (max 50% of unigram count)
- Negation/out-of-scope expectations use a separate scoring path (refusal signal detection vs. fulfillment signal detection)
- Confidence threshold: >= 0.5 = pass, < 0.3 = fail, between = manual review

### Draft Save Failures Had a Simple Root Cause

The `discoveryDocuments: null` vs `undefined` distinction caused persistent 400 errors from the backend validation layer. The backend's `readOptionalDiscoveryDocuments` only accepted `undefined` (key omitted) but the frontend sent explicit `null`. Fix: both sides — frontend converts `null` → `undefined` before JSON.stringify, backend accepts `null` as equivalent to `undefined`.

## Evidence

- 22 unit tests pass across eval-scorer, eval-scenario-generator, eval-mock-generator
- Google Ads proving case: campaign performance scenario scores correctly with mock data
- Draft save badge changed from "Draft save failed" (red) to "Saving draft..." (green) after frontend fix

## Implications For Future Agents

- When adding a new well-known API to the platform, add a template to `API_TEMPLATES` in `eval-mock-generator.ts` with realistic endpoints and sample data
- The `API_DETECTION_KEYWORDS` map determines which templates activate — keep it updated as new integrations are added
- The mock mode soul override (`buildMockModeInstruction`) injects mock data directly into the architect's context — this pattern can be extended for any tool type
- If scoring accuracy becomes insufficient, the next step is LLM-based scoring (send response + expected behavior to a judge model) rather than expanding the heuristic

## Links
- [[008-agent-builder-ui]] — eval engine is part of the create agent flow
- [[SPEC-pre-deploy-agent-testing]] — related spec for pre-deploy testing
- [Journal entry](../../journal/2026-03-29.md)
