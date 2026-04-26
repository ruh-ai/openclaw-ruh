# 001 — Overview

> **Since:** `1.0.0-alpha.1`
> **Status:** stable for v1 (philosophy, not interfaces)
> **Read time:** ~12 min

---

## The bet

**Coding agents are the developers.** Within ~12 months, frontier models (Claude Opus 4.7+, GPT 5.5+, and successors) will produce production-grade code reliably enough that the bottleneck is no longer "write the code" but "tell the agent what to write and verify it." The OpenClaw platform is designed for that world — not retrofitted into it.

That bet has three corollaries:

1. **The spec is the leverage.** A coding agent given a clear, machine-checkable contract produces composable work. A coding agent given a vague intent produces sprawl. The spec is the constraint that lets agents work freely without diverging.
2. **Humans review and steer; they don't type.** The platform's UX pivots from "humans fill out a form" to "humans watch an agent build and intervene at named checkpoints." Every interaction surface is designed around that division of labor.
3. **The output is a pipeline, not an agent.** Real customer needs (ECC's estimator, future fleets) are multi-agent systems. The unit of delivery is a fleet — orchestrator + specialists + shared memory + bespoke dashboard — not a chatbot. Single-agent flows are the smallest case of a pipeline.

The work the spec governs is the work that compounds: every previous pipeline becomes reference context for the next, every spec evolution carries forward, every conformant artifact remains usable inside future pipelines.

## What OpenClaw is

A **specification + runtime + agent harness** for producing multi-agent systems that:

- Run inside customer tenants (Docker container per pipeline; on-prem when required, like ECC)
- Compose freely (any agent's tools are callable by any orchestrator that knows the spec)
- Self-improve via ground-truth eval loops (the 200-project pattern: estimate → compare → reflect → rewrite → re-run)
- Surface to end users through bespoke operational dashboards plus an orchestrator chat
- Get *built* by coding agents under human review, not hand-coded per customer

The platform itself is one such system. Its agent-builder is a pipeline that produces other pipelines. As coding-agent capability grows, the agent-builder pipeline gets rebuilt by the same loop it produces customer pipelines through. The platform builds the platform.

## What OpenClaw is not

- **Not a visual pipeline editor.** Node-RED, n8n, Zapier, Power Automate all hit the same wall: too generic = unusable; too specific = doesn't compose. OpenClaw uses opinionated templates and conversation-driven editing instead.
- **Not a generic agent SDK.** OpenClaw is opinionated about lifecycles, memory tiers, decision logs, eval loops — choices that make sense for *enterprise digital employees with a soul*, not for arbitrary agent use cases. If you'd be served by LangChain or Claude Agent SDK directly, use those.
- **Not a per-customer hand-coded delivery.** Every customer pipeline is produced through the same process and conforms to the same spec. ECC is the first; the second comes faster because the spec is richer; the tenth ships in days.
- **Not eternal.** The spec versions. Pipelines target a specific version. When the spec evolves, old pipelines keep running on their declared version; new pipelines opt into the new contract.

## The flow

```
Customer requirements (doc, transcript, recording)
        ↓
Human developer: clarifies intent, sets priorities, defines success criteria
        ↓
Coding agent (architect): reads requirements + OpenClaw Spec + reference pipelines
        ↓
Coding agent generates: agents (SOULs, skills, tools), orchestrator,
                        dashboard, integrations, eval suite, configuration
        ↓
Verification harness: schema validation → typecheck → unit tests →
                      integration tests → eval suite → convergence loop
        ↓
Human review checkpoints: approve / correct / redirect at each named stage
        ↓
Ship to customer tenant
        ↓
Same flow extends the system later (new requirement → diff ships)
```

Every box in that flow is defined by the spec. The coding agent is constrained at every step; the human reviews structured artifacts (decision logs, diffs, eval results), not freeform prose.

## Core principles

These are the load-bearing decisions that resolve future tradeoffs. When a future spec section forces a choice, it's resolved against these principles, not by taste.

### 1. Conformance over flexibility

Every artifact (agent, tool, panel, memory entry, eval task, pipeline) conforms to a versioned schema. **No artifact ships that fails its schema.** The runtime refuses to load non-conformant pipelines. The spec is rigid on purpose: rigidity is what lets agents produced today run inside fleets composed tomorrow.

When a real need exceeds what the schema allows, the answer is to evolve the schema (under [versioning](100-versioning.md)), not to bypass it. Workarounds are how platforms die.

### 2. Memory is tiered and lane-aware, never flat

Different roles have different authority over different domains. ECC's lead estimator (Darrow) is authoritative on estimating mechanics; ECC's CEO (Matt) is authoritative on business posture; ECC's VP Ops (Scott) is authoritative on deployment and operations. A flat "memory is memory" model lets one role's writes overwrite another's; that's not memory, that's noise.

Every memory write carries `{tier, lane, source_identity, status}` and the runtime routes proposed writes to the appropriate authority. ECC's needs forced this in v1; every future pipeline benefits.

### 3. Configuration is data, not prompt

Labor rates, jurisdictional taxes, paint-type bands, response-time SLAs, support tier definitions — these are *configuration*, not agent reasoning. Configuration lives in a multi-dimensional, versioned, hot-swappable substrate that the agent reads at runtime. **Numbers do not get baked into prompts.**

When a customer says "we operate in 15 states with different labor rates per region," the answer is a config dimension, not a prompt rewrite.

### 4. Every decision is logged

The decision log is not a debug surface — it's a deliverable. Customers (and human reviewers) read it to understand *why* an agent did what it did. Coding agents read prior decision logs as reference context for similar situations.

Every typed event the runtime emits — tool selection, error classification, recovery action, memory write, sub-agent spawn, compaction event — appears in the decision log with metadata. If you can't explain a behavior from the decision log alone, the log is incomplete.

### 5. Verification is automated; review is human

The pre-merge gate combines schema validation, typecheck, lint, unit tests, integration tests, and the eval suite — all automated. Humans review *intent*: did the agent solve the right problem? Did it pick a reasonable approach at the seams? Is the output what the customer actually wants?

Humans should never catch "the code doesn't compile." If they're catching that, the verification harness is broken. Fix the harness.

### 6. The unit of delivery is a pipeline

Pipelines are declared in a top-level `pipeline-manifest.json` that names the agents, the orchestrator, the shared memory, the shared config, the dashboard panels, the eval suite, and the spec version. Every other artifact references the manifest. **Single agents ship as one-node pipelines** — the same machinery, the smallest case.

This means: you can't ship "just an agent" without also declaring how it composes. Composability isn't bolted on; it's the default.

### 7. Domain extraction is human work

Coding agents are excellent at structuring elicited knowledge into a SOUL, skills, and tools. They're poor at *eliciting* it from a domain expert who can't articulate their own judgment. Getting Darrow Rogers' estimating philosophy out of his head is a human-on-human conversation. The platform's job is to make that conversation productive (give interviewers the right structure, capture the output cleanly), not to replace it.

Every customer engagement budgets for human-in-the-loop discovery time before generation begins.

### 8. The platform builds the platform

The agent-builder is itself a pipeline expressed in this spec. As the spec matures and coding agents improve, the agent-builder pipeline gets rebuilt through the same flow it produces customer pipelines through. Recursion is earned, not targeted: it happens *because* the platform shipped 2-3 customers cleanly, not as the goal of v1.

## Architecture in one diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       OpenClaw Spec v1 (this doc)                    │
│  Schemas │ Contracts │ Conformance rules │ Versioning policy         │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ conforms to
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                       Coding agent (architect)                       │
│                  (Claude Opus 4.7+ / GPT 5.5+ / future)             │
│   reads spec + requirements + reference pipelines → generates code   │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ steered by
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                       Human-review surface                           │
│      decision log feed │ diff review │ approve/correct checkpoints   │
└─────────────────────────────────────────────────────────────────────┘
                              ▲ verified by
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                       Verification harness                           │
│   schema → typecheck → tests → integration → eval suite → convergence│
└─────────────────────────────────────────────────────────────────────┘
                              ▲ produces
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                       Customer pipeline                              │
│  orchestrator + specialists + memory + config + dashboard + eval     │
│         (single-agent or multi-agent fleet, same machinery)          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ runs in
┌─────────────────────────────────────────────────────────────────────┐
│                       OpenClaw runtime                               │
│  Sandboxed Docker containers │ Postgres-backed state │ AG-UI events  │
│            (per-pipeline tenant boundary, on-prem capable)           │
└─────────────────────────────────────────────────────────────────────┘
```

## The pipeline as the unit of delivery

A pipeline in OpenClaw is a tuple:

```
Pipeline = {
  spec_version: "1.0.0"
  agents: [Agent, ...]            // one or more, each conforming to 002-agent-manifest
  orchestrator: Orchestrator       // routes user input to specialists, merges results
  memory: SharedMemory             // tier/lane-aware, scoped to this pipeline
  config: ConfigSubstrate          // multi-dimensional, versioned, hot-swappable
  dashboard: [Panel, ...]           // bespoke surface generated from registered panels
  eval_suite: [EvalTask, ...]       // ground-truth tasks for the convergence loop
  hooks: [Hook, ...]               // lifecycle extension points
}
```

Single-agent flows are pipelines with `len(agents) == 1` and a trivial orchestrator. Multi-agent fleets (like ECC's estimator) are pipelines with N specialists and an orchestrator that knows which one to call.

A pipeline ships to a customer tenant. It runs there. When the same customer needs more capability, the *same* pipeline grows by extending the manifest — not by deploying a new system.

## ECC as the proving case

The ECC Exteriors Estimator (see `work/projects/ecc-construction/ECC_DEV_TEAM_ONBOARDING.md`) is the first concrete pipeline this spec must support. Every section of the spec must be rich enough to express what ECC needs:

- **Multi-modal ingestion** — photos (500+), handwritten reMarkable PDFs, RFP PDFs, occasional drawings → tools section must support vision-call patterns and chunked manifest generation
- **11-phase estimating workflow** — research, source assessment, scope bucketing, takeoff, pricing, gap analysis, RFQ generation, decision log, QA, narrative, PPTX → orchestrator must support sequential and parallel sub-agent dispatch
- **Tiered authority memory** — Darrow Tier-1-Estimating, Matt Tier-1-Business, Scott Tier-1-Ops/Tier-2-Estimating, regional estimators Tier-3 → memory model is the load-bearing test of the tier/lane design
- **Configuration substrate** — labor rates × region × sub × season, jurisdictional taxes, paint-type bands by substrate → config substrate must support multi-dimensional indexing
- **200-project recursive training loop** — estimate → compare to ECC actual → reflect → rewrite skill file → re-run → converge to <tolerance → eval task format and convergence loop must support skill-file mutation, not just prompt iteration
- **10 typed deliverables per estimate** — Master Package, Takeoff Report, Cost Breakdown, Gap Analysis, RFQ Packets, Decision Log, QA Checklist, Proposal Narrative, PPTX, Source Assessment → output validator section must support deliverable schemas and dashboard panels for each
- **Tenant-bounded deployment** — Lenovo Windows box, no egress, Anthropic Premium passed through → runtime contract must support single-tenant, on-prem, server-side checkpoint persistence
- **M6 milestone** — 75% routine estimates autonomous within 6 months of go-live, with refund clause if missed → conformance + eval suite must support measurable autonomous-completion-rate dashboards

Every section in the spec is reviewed against ECC's needs. If the spec can't express ECC, the spec is wrong. If ECC can't run on the spec, the spec needs evolving — but every other pipeline benefits from the evolution.

## What the spec does *not* commit to (yet)

To keep v1 focused:

- **No multi-customer tenancy.** Each pipeline assumes its own tenant. Cross-pipeline composition (one customer's pipeline calling another's) is deferred to v2.
- **No spec-evolution tooling.** v1 evolves via human authorship of new sections. Machine-assisted spec migration is a v2+ goal.
- **No "open marketplace" of community-authored agents.** Every conformant pipeline must pass review by the platform team before joining the reference corpus. Marketplace dynamics are a v2+ concern.
- **No agent-to-agent contract negotiation.** Agents inside a pipeline conform to fixed contracts declared in the manifest at build time. Runtime contract negotiation is a v3+ topic.

These are commitments to *finish v1*, not statements about long-term direction.

## How to read the rest of this spec

- **Part A — Agents and tools** ([002](002-agent-manifest.md), [003](003-tool-contract.md), [014](014-error-taxonomy.md), [015](015-output-validator.md)) — the building blocks every pipeline uses. Read these first; everything else builds on them.
- **Part B — Memory, observability, state** ([004](004-memory-model.md), [005](005-decision-log.md), [009](009-config-substrate.md), [012](012-checkpoint.md), [013](013-hooks.md)) — what agents persist and observe. The most opinionated parts of the spec; the principles above (tiered memory, config-not-prompt, every-decision-logged) live here.
- **Part C — Composition** ([006](006-orchestrator.md), [007](007-sub-agent.md), [008](008-eval-task.md), [011](011-pipeline-manifest.md)) — how fleets work. The pipeline manifest in [011](011-pipeline-manifest.md) is the document that ties everything together.
- **Part D — Surfaces** ([010](010-dashboard-panels.md)) — how end users interact. Bespoke dashboards generated from a panel library, plus the orchestrator chat.
- **Part E — Meta** ([100](100-versioning.md), [101](101-conformance.md)) — how the spec evolves and how to verify a pipeline conforms.

After this overview, **start with [002 — agent manifest](002-agent-manifest.md)**. That's the smallest unit of work the spec defines, and everything else references it.

## A note on tone

This spec is opinionated. It says "must" where flexibility would erode composition; it picks one design where neutrality would force every pipeline to re-decide. **The cost of opinionation is that some teams won't fit; the benefit is that teams that do fit get massive leverage from the platform.** That's the trade we're making intentionally.

When a future contributor (human or AI) wants to relax an opinion, the burden of proof is on them: which composition guarantee does relaxation preserve, and at what cost? That conversation belongs in [100 — versioning](100-versioning.md).

---

*Next: [002 — agent manifest](002-agent-manifest.md). The shape every agent in every pipeline conforms to.*
