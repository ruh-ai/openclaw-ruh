---
type: kb/decision-note
tags:
  - kb/decision-note
  - kb/project-knowledge
  - kb/architecture
  - kb/monorepo
created: 2026-03-10 09:29
status: accepted
---
# Monorepo Topology and Package Boundaries ADR

## Decision

### Repository Topology
- Use this repository as the single Ruh.ai implementation monorepo, while keeping the existing `docs/`, `ops/`, `scripts/`, and `tests/` trees at the root for planning and operational material.
- Add implementation code and assets in five top-level roots only: `apps/`, `packages/`, `packs/`, `overlays/`, and `tooling/`.
- Treat `apps/` as deployable services, `packages/` as reusable code and schemas, `packs/` as customer-neutral product assets, `overlays/` as non-secret reference overlays and test fixtures, and `tooling/` as workspace-level build and CI support.
- Do not place pack manifests, workflow definitions, prompts, eval fixtures, or tenant overlay examples inside service apps.
- Do not store live customer secrets, tenant-private overlays, or environment-specific credentials in this monorepo.

### Control-Plane Service Boundaries
- Start V1 with two deployable control-plane services under `apps/`:
  - `apps/control-plane-api` for synchronous HTTP or admin APIs covering pack registry reads, deployment commands, approval decisions, artifact access, and operator-facing status.
  - `apps/control-plane-worker` for asynchronous jobs covering compilation, deployment apply and drift checks, workflow orchestration, eval execution, connector polling or write-backs, and other queued control-plane work.
- Keep both apps thin. Transport, auth wiring, and process bootstrap belong in the app folders; reusable business logic belongs in `packages/`.
- Do not split compiler, runtime manager, approval engine, artifact service, secrets broker, or eval runner into separate deployables in V1. They begin as packages consumed by the API and worker, and only graduate into standalone services if scale, latency isolation, or blast-radius concerns force that change.
- Keep OpenClaw runtime execution outside the monorepo app layer. Ruh.ai owns control-plane services and runtime adapters, but OpenClaw remains the runtime plane defined by [[Knowledge Base/Project Knowledge/V1 Boundary and Non-Goals ADR|V1 Boundary and Non-Goals ADR]].

### Package Boundaries
- Use `packages/domain/` for canonical entities, ID types, lifecycle states, validation helpers, and shared invariants that must stay consistent across API, compiler, worker, and connector code.
- Use `packages/contracts/` for typed API payloads and internal event contracts. Split at least into `packages/contracts/api` and `packages/contracts/events` so synchronous and asynchronous interfaces can evolve independently.
- Use `packages/schemas/` for versioned manifest and bundle schemas. The initial schema package set should include `pack-manifest`, `overlay-manifest`, `deployment-bundle`, `connector-install`, and `workflow-graph`.
- Use `packages/control-plane/` for reusable service-domain modules such as deployments, orchestration, approvals, artifacts, secrets, evals, and telemetry. These modules carry control-plane behavior without becoming deployables themselves.
- Use `packages/compiler/` for the compiler pipeline. Split it into `packages/compiler/core` for graph loading, validation, normalization, and planning, plus `packages/compiler/openclaw-target` for emitting OpenClaw-ready bundle output.
- Use `packages/runtime/` for runtime-facing adapters. Start with `packages/runtime/openclaw-adapter` so bundle apply, status, and drift logic do not leak into the worker app.
- Use `packages/connectors/` for connector code. Create one package per external system, plus one shared core package:
  - `packages/connectors/core`
  - `packages/connectors/github`
  - `packages/connectors/linear`
  - `packages/connectors/slack`
  - `packages/connectors/sentry`
  - later `packages/connectors/procore`, `packages/connectors/sharepoint`, and `packages/connectors/teams`

### Pack And Overlay Asset Boundaries
- Store reusable pack assets under `packs/<pack-slug>/` rather than in `packages/` or `apps/`.
- Each pack folder should own customer-neutral assets only: `pack.yaml`, employee definitions, workflow definitions, prompt assets, policy defaults, artifact templates, eval suites, fixtures, and pack-local documentation.
- Keep overlays separate from packs under `overlays/<overlay-slug>/` because overlays bind a pack to one trust boundary, workspace strategy, role map, connector install set, and policy posture. They are deployment inputs, not reusable product assets.
- Allow only reference, demo, and test overlays in the monorepo. Real tenant overlays that embed sensitive bindings should live in tenant-controlled configuration stores or deployment repositories.
- Make the compiler the only path that turns `packs/` plus `overlays/` into deployment bundles. Apps and connectors consume the compiled bundle contract; they do not read pack assets directly at runtime.

### Dependency Rules
- Enforce a one-way dependency stack: `packages/domain` -> `packages/contracts` and `packages/schemas` -> `packages/control-plane`, `packages/compiler`, `packages/runtime`, and `packages/connectors` -> `apps/*`.
- Do not allow app-to-app imports.
- Do not allow connector packages to depend on other connector packages except through `packages/connectors/core`.
- Do not allow pack or overlay assets to import service code. They are validated and compiled as data.
- Keep schema packages independent from app bootstrap concerns so downstream work on `RUH-218`, `RUH-219`, and `RUH-220` can publish stable contracts before service implementation grows around them.

### Initial Target Layout
```text
docs/
ops/
scripts/
tests/
apps/
  control-plane-api/
  control-plane-worker/
packages/
  domain/
  contracts/
    api/
    events/
  schemas/
    pack-manifest/
    overlay-manifest/
    deployment-bundle/
    connector-install/
    workflow-graph/
  control-plane/
    deployments/
    orchestration/
    approvals/
    artifacts/
    secrets/
    evals/
    telemetry/
  compiler/
    core/
    openclaw-target/
  runtime/
    openclaw-adapter/
  connectors/
    core/
    github/
    linear/
    slack/
    sentry/
packs/
  ai-buildops/
  construction-project-operations/
overlays/
  ai-buildops/
  construction/
tooling/
```

## Context
`RUH-213`, `RUH-214`, and `RUH-215` all need a stable repository shape before scaffolding starts. The build plan already calls for one implementation repository structure that can hold platform core, pack definitions, connectors, and deployment assets. The earlier boundary ADR fixed the product and trust-boundary split between Ruh.ai and OpenClaw, but it did not decide how code and assets should be partitioned inside the Ruh.ai repository.

This decision keeps control-plane deployables small in number, puts shared contracts and schemas below service code, isolates connector implementations by system, and treats pack assets as versioned product content rather than embedded app code.

## Tradeoffs
- One monorepo simplifies cross-cutting contract changes across apps, schemas, compiler code, connectors, and packs, but it requires disciplined dependency rules and CI scoping.
- Two V1 services are operationally simpler than a microservice mesh, but they concentrate more responsibility into the worker until scaling pressure justifies more splits.
- A package-per-connector boundary improves capability isolation, secret handling review, and future ownership, but it increases workspace count and release coordination.
- Keeping packs and overlays outside code packages protects reuse and governance, but it makes the compiler mandatory for every deployment and test path.

## Follow-up
- `RUH-213` should scaffold workspace tooling and CI around the top-level roots in this ADR, with checks that preserve the dependency direction described above.
- `RUH-214` should create `apps/control-plane-api`, `apps/control-plane-worker`, and the first `packages/control-plane/*` modules instead of introducing extra deployables.
- `RUH-215` should create the compiler, runtime adapter, connector, and pack shells using the package boundaries named here.
- `RUH-218`, `RUH-219`, and `RUH-220` should publish their contracts under `packages/schemas/*` and `packages/contracts/*` rather than burying them inside app folders.
- If future scale requires service decomposition, split from `packages/control-plane/*` into new apps without moving schemas, compiler code, connector packages, or pack assets out of the monorepo.

## Source Notes
- [[Knowledge Base/Project Knowledge/V1 Boundary and Non-Goals ADR|V1 Boundary and Non-Goals ADR]]
- [[Knowledge Base/Project Knowledge/Architecture Model|Architecture Model]]
- [[Knowledge Base/Project Knowledge/Internal API and Event Contract v0.1|Internal API and Event Contract v0.1]]
- [[Knowledge Base/Project Knowledge/Packs and Overlays|Packs and Overlays]]
- [[02 Operations/Build Plan|Build Plan]]
