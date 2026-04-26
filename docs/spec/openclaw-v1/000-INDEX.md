# OpenClaw Spec v1 — Index

> **Status:** `draft` — foundation landing now, sections being written iteratively
> **Spec version:** `1.0.0-alpha.1`
> **Last updated:** 2026-04-27
> **Audience:** humans authoring conformant pipelines, **and coding agents (Claude Opus 4.7+, GPT 5.5+) building them**

---

## What this spec is

The contract every artifact produced by — or accepted into — the OpenClaw platform must satisfy. It defines the shape of agents, tools, memory, orchestrators, dashboards, and the pipelines that compose them, so that work produced by any actor (human or AI) at any time composes with work produced by any other.

The spec is the **strict guideline** the platform stands on. Coding agents read it as load-bearing context; humans read it to review, correct, and steer.

## What this spec is *not*

- **Not a tutorial.** Tutorials live next to it; the spec is reference material.
- **Not a runtime.** The runtime that *implements* this spec lives in `agent-builder-ui/`, `ruh-backend/`, and (under iteration) `worktree-feat+architect-tool-harness`. The spec defines *what conforms*, not *how the runtime works internally*.
- **Not a feature wishlist.** Sections are added when a concrete need (typically a customer pipeline like ECC) forces a decision we'd otherwise defer.

## Scope (v1)

This version targets the **multi-agent pipeline** model:

- A pipeline is **one or more agents + an orchestrator + shared memory + shared config**, deployed as a unit.
- Single-agent flows are the smallest case of a pipeline (1 agent, no orchestrator routing, single-tier memory).
- Pipelines run on the OpenClaw runtime (sandboxed Docker containers; see `docs/knowledge-base/003-sandbox-lifecycle.md`).
- Pipelines surface to end users through **bespoke dashboards** generated from registered panels, plus an **orchestrator chat** as the catch-all entry point.

Out of scope for v1 (deferred to later versions):

- Multi-tenant fleet isolation across customers (each pipeline assumes its own tenant boundary)
- Cross-pipeline composition (one customer's pipeline calling another's)
- Spec-evolution tooling (machine-assisted spec migration)

## Table of contents

### Part A — Agents and tools (the building blocks)

| Section | Title | Status |
|---|---|---|
| [001](001-overview.md) | Overview — vision, principles, the role of the spec | ✅ done |
| [002](002-agent-manifest.md) | Agent manifest — SOUL.md, skills/, tools/, triggers/, .openclaw/ | ✅ done |
| [003](003-tool-contract.md) | Tool contract — schema, permissions, concurrency, observability | ✅ done |
| [014](014-error-taxonomy.md) | Error taxonomy + retry strategy | ✅ done |
| [015](015-output-validator.md) | Structured output validation (Zod schemas, marker tokenizer) | ✅ done |

### Part B — Memory, observability, state

| Section | Title | Status |
|---|---|---|
| [004](004-memory-model.md) | Memory model — tier/lane-aware, role-attested writes | ✅ done |
| [005](005-decision-log.md) | Decision log — typed events, audit trail | ✅ done |
| [009](009-config-substrate.md) | Configuration substrate — multi-dimensional, versioned, hot-swappable | ✅ done |
| [012](012-checkpoint.md) | Checkpoint + resume — state snapshots, rate-limit recovery | ✅ done |
| [013](013-hooks.md) | Lifecycle hooks — extensibility points | ✅ done |

### Part C — Composition (multi-agent fleets)

| Section | Title | Status |
|---|---|---|
| [006](006-orchestrator.md) | Orchestrator protocol — handoff, context transfer, result merge | ✅ done |
| [007](007-sub-agent.md) | Sub-agent isolation — workspace scope, identity, lifecycle | ✅ done |
| [008](008-eval-task.md) | Eval task format — input, expected output, judge prompt, score rubric | ✅ done |
| [011](011-pipeline-manifest.md) | Pipeline manifest — the top-level artifact | ✅ done |

### Part D — Surfaces (how end users interact)

| Section | Title | Status |
|---|---|---|
| [010](010-dashboard-panels.md) | Dashboard panel registration — data sources, actions, role visibility | 📝 pending |

### Part E — Meta

| Section | Title | Status |
|---|---|---|
| [100](100-versioning.md) | Spec versioning — how this document evolves without breaking pipelines | 📝 pending |
| [101](101-conformance.md) | Conformance — how to verify a pipeline conforms | 📝 pending |

### Schemas (machine-readable)

`schemas/` contains JSON Schema definitions for every contract above. Coding agents and runtime validators reference these as the single source of truth — markdown is for humans, JSON Schema is for machines.

### Examples (reference implementations)

`examples/` contains complete, runnable conformant pipelines:

- `single-agent-minimal/` — the smallest pipeline that conforms (one agent, no orchestrator, no eval loop)
- `multi-agent-fleet/` — a representative fleet (orchestrator + 3 specialists + shared memory)
- `ecc-estimator-pipeline/` — the proving case from `work/projects/ecc-construction/` — full ECC estimator with intake, vision-manifest, takeoff, pricing, gap, narrative, PPTX, and 200-project training-loop agents

## Roadmap

**Phase 0 — Foundation (✅ complete):** 000-INDEX, 001-overview. Sets vision and structure.

**Phase 1 — Building blocks (✅ complete):** 002 (agent manifest), 003 (tool contract), 014 (errors), 015 (output validator). The primitives every agent uses. ~70% extracted from `worktree-feat+architect-tool-harness` into formal contracts.

**Phase 2 — State and memory (✅ complete):** 004 (memory), 005 (decision log), 009 (config), 012 (checkpoint), 013 (hooks). What agents persist and observe.

**Phase 3 — Composition (✅ complete):** 006 (orchestrator), 007 (sub-agent), 008 (eval task), 011 (pipeline manifest). How fleets work.

**Phase 4 — Surfaces and meta:** 010 (dashboards), 100 (versioning), 101 (conformance). How users interact and how the spec evolves.

Each phase is a separate PR. Phase 1 is the load-bearing one — once 002, 003, 014, 015 land, the spec is concrete enough that a coding agent could begin producing conformant agents (not yet pipelines).

## Conventions

- **Markdown for human-readable contracts.** Every section opens with the contract in prose, followed by examples, followed by the formal JSON Schema reference.
- **JSON Schema for machine-enforced contracts.** Every shape declared in markdown has a corresponding `.schema.json` file in `schemas/`. The schema is authoritative on validation.
- **Examples are mandatory, not optional.** Every section includes at least one minimal valid example and one anti-example (what *not* to do, and why).
- **Cross-references use `[[wikilinks]]`** to neighboring sections, mirroring the KB convention.
- **Stable section numbers.** Once a section is published in a release, its number does not change. New sections take new numbers; deprecated sections move to `999-deprecated/<old-number>.md` rather than being deleted.

## How to use this spec

### As a human reviewer

Read 001 (overview) first, then jump to whichever section is relevant to the work in front of you. The TOC above maps tasks to sections. Use 101 (conformance) before approving any pipeline for ship.

### As a coding agent

Load the full spec into context at session start. When generating an artifact, validate against the corresponding section's JSON Schema before claiming completion. Cite the section and version when explaining decisions in the decision log (`spec://openclaw-v1/003-tool-contract#3.2`).

### As a future-you reviewing past decisions

Every conformant pipeline carries its `pipeline-manifest.json` declaring which spec version it was built against. To understand why a pipeline was structured a certain way, read the spec at that version (recovered via `git log` against this directory).

## Versioning at a glance

`major.minor.patch-prerelease`:

- **Major** — breaking changes that require pipelines to migrate (rare, painful, should never happen for v1)
- **Minor** — new sections or new optional fields in existing sections (additive, safe)
- **Patch** — clarifications, examples, typo fixes (non-normative)
- **Prerelease** — `-alpha.N` while sections are still being drafted; `-rc.N` once feature-complete; remove for stable

Every section header carries `Since: <version>`. A pipeline declares its target version in its manifest and is expected to conform to that version exactly.

Full versioning policy: [100-versioning.md](100-versioning.md) (pending).

---

*Each section number is reserved even if the file is empty. Pending sections show their planned headings as a stub, not as TBD content.*
