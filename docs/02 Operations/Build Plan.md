# Build Plan

## Objective

Build Ruh.ai V1 as a governed digital-employee control plane on top of OpenClaw, prove the platform with the AI BuildOps wedge first, and keep the product architecture reusable enough to support the Construction Project Operations pack without forking the platform.

## Planning Assumptions

- The workspace currently contains documentation, overlays, and knowledge-base notes, not an application implementation.
- The AI BuildOps pack is the first execution wedge because it already has the most complete overlay for GitHub, Linear, Slack, and Sentry.
- Construction remains an explicit second pack, but not the first build slice.
- The missing API and Event Contract Specification is a real gap and should be treated as an early blocker for interface-heavy implementation work.
- Linear should be the single planning system of record for this repo; docs remain the design and knowledge source of truth.

## Plan Sync Rule

- This note is the Obsidian mirror of the current project development plan.
- Update this note in the same work session whenever the execution plan changes materially in Linear.
- Material changes include phase sequencing, milestones, parent-child backlog structure, current or next execution slice, and critical dependency changes.
- Routine status, assignee, estimate, or comment changes do not require rewriting this note unless they change the execution plan.
- Last synchronized with Linear: `2026-03-09`

## Product Boundary To Preserve

- Shared Ruh.ai control plane plus dedicated runtime plane per tenant trust boundary.
- Typed tasks, artifacts, approvals, and audit trails instead of free-form agent chat as the business state model.
- Reusable packs for shared behavior; tenant overlays for customer-specific bindings.
- Human approval gates for medium-risk and high-risk actions.
- Pilot-first rollout: monitor, draft, approval, then constrained autonomy.

## Recommended Delivery Order

### Phase 0: Scope Lock And Program Setup

Purpose: convert the current documentation set into an executable engineering program.

Deliverables

- Lock V1 scope, success metrics, and non-goals from the PRD and system design.
- Record architecture decisions for trust boundary, runtime isolation, collaboration model, and approval posture.
- Add the missing API and Event Contract source or create an internal substitute spec from the current docs.
- Create the implementation repository structure for platform core, pack definitions, connectors, and deployment assets.
- Configure Linear as the operating system for execution: milestones, labels, issue templates, weekly planning and review cadence.

Exit criteria

- No open ambiguity about the V1 system boundary.
- Linear contains the top-level milestones and workstreams.
- The missing interface spec is either recovered or replaced with an internal contract draft.

### Phase 1: Platform Core Foundation

Purpose: create the minimum control-plane backbone that can compile and govern one digital-employee deployment.

Deliverables

- Canonical data model for tenant, runtime environment, workspace, employee template, employee instance, work item, task, artifact, approval, deployment, and run telemetry.
- Identity and tenant model with one environment per trust boundary.
- Deployment compiler skeleton that renders pack plus overlay inputs into deterministic runtime bundles.
- Runtime manager that tracks gateway state, applied bundles, and environment drift.
- Workflow orchestrator that advances task graphs independently of transcript state.
- Artifact service for durable outputs and lineage.
- Policy and approval service for risk classification and protected actions.
- Secrets broker for scoped connector and runtime secret references.
- Observability and eval scaffolding for run health, costs, and quality measurement.

Exit criteria

- One placeholder pack plus overlay can compile into a deployment artifact.
- The control plane can represent runs, artifacts, approvals, and runtime environments coherently.

### Phase 2: Pack System And AI BuildOps MVP

Purpose: turn the platform core into a reusable AI BuildOps product slice.

Deliverables

- Pack manifest schema and validation rules aligned with the employee pack specification.
- Template and pack registry with versioned assets.
- AI BuildOps employee templates for intake, spec, planning, build orchestration, QA and evals, release, and incident feedback.
- Workflow templates and artifact contracts for intake, spec generation, planning, build orchestration, eval gating, release prep, and incident learning.
- Connector bindings and capability maps for GitHub, Linear, Slack, and Sentry.
- Overlay compiler support for the `ai-buildops.github-linear-slack-sentry` manifest.
- Baseline eval suites for spec quality, protected-branch compliance, release gates, and incident-to-regression learning.

Exit criteria

- The platform can compile the AI BuildOps pack and the GitHub + Linear + Slack + Sentry overlay into one deployable bundle.
- One workflow slice can run end-to-end in monitor or draft mode.

### Phase 3: AI BuildOps Pilot Slice

Purpose: prove the first narrow value loop with the target engineering stack.

Deliverables

- Intake to spec workflow with Linear as the planning system of record.
- Spec to build orchestration with GitHub as the code system of record.
- Eval and release prep behind explicit approval gates.
- Slack-based approvals and operator visibility.
- Sentry-driven incident follow-up and regression case creation.
- Baseline capture and scorecard instrumentation for time-to-owner, spec quality, approval behavior, and failure rates.

Exit criteria

- One service boundary can move from signal to approved spec to PR orchestration with auditable artifacts.
- Weekly pilot scorecards show measurable trust and throughput improvement over baseline.

### Phase 4: Production Gate And Hardening

Purpose: make the first pack safe to expand beyond a demo pilot.

Deliverables

- Reliable approval logging, override capture, audit views, and replayability.
- Cost and quality dashboards for pack, workflow, and tenant slices.
- Connector least-privilege validation and health checks.
- Promotion path from monitor to draft to approval mode to constrained autonomy.
- Incident handling and rollback runbooks.
- Release criteria for first-production overlay promotion.

Exit criteria

- Protected actions cannot bypass approval policy.
- Operators can explain what happened in a run, why, and which artifacts or approvals were involved.

### Phase 5: Construction Pack Expansion

Purpose: prove that the platform is reusable across a second wedge without cloning the architecture.

Deliverables

- Construction Project Operations employee templates and workflow definitions.
- Procore + SharePoint + Teams overlay support.
- Construction-specific evals for citation quality, stale document detection, routing, and approval compliance.
- Pilot packaging for two to three live projects.

Exit criteria

- The second pack reuses the same core platform and deployment path.
- The product thesis holds: new customer value comes from packs and overlays, not bespoke runtime logic.

## Cross-Cutting Tracks

### Contracts And Schemas

- Normalize every workflow around typed tasks, artifacts, and approvals.
- Keep pack and overlay schemas versioned and diffable.
- Close the missing API/event contract gap early.

### Connectors And Systems Of Record

- Keep GitHub, Linear, Slack, and Sentry authoritative in their native domains.
- Treat overlays as orchestration and policy layers, not replacements.
- Keep secret references and connector installs out of source-controlled manifests where possible.

### Governance And Trust

- Preserve one-gateway-per-trust-boundary assumptions throughout architecture and deployment.
- Treat approval gates as product behavior, not a temporary control.
- Make auditability and replay first-class platform outputs.

### Pilot Learning Loop

- Convert every pilot exception into pack, overlay, or platform backlog items.
- Maintain one scorecard per pilot and one gate review per rollout phase.

## Recommended Linear Operating Model

Project

- Keep one project: `openclaw-ruh`

Milestones

- `Phase 0 - Scope Lock and Program Setup`
- `Phase 1 - Platform Core Foundation`
- `Phase 2 - Pack System and AI BuildOps MVP`
- `Phase 3 - AI BuildOps Pilot Slice`
- `Phase 4 - Production Gate and Hardening`
- `Phase 5 - Construction Pack Expansion`

Track labels

- `platform`
- `ai-buildops`
- `construction`
- `pilot`

Capability labels

- `runtime`
- `pack-system`
- `workflow`
- `artifact`
- `connector`
- `approvals`
- `secrets`
- `evals`
- `observability`

Scope labels

- `mvp`
- `overlay`
- `design-partner`

Issue hierarchy

- Use milestone-level issues for the main deliverables of each phase.
- Keep one issue per meaningful deliverable, not per paragraph of the docs.
- Split child work only after the milestone issue has an agreed acceptance test.

Cadence

- Weekly planning: refine backlog and assign the next slice.
- Weekly architecture review: decisions, contract gaps, and runtime boundary changes.
- Weekly pilot review once Phase 3 begins: baseline, trust, quality, and blocker review.

## Current Execution Snapshot

Synced from Linear on `2026-03-09`.

Project state

- Project: `openclaw-ruh`
- Status: `In Progress`
- Structure: 15 parent workstreams plus execution child issues for Phase 0, Phase 1, and Phase 2 runway

Active cycle

- `RUH-208` Publish V1 boundary ADR and non-goals
- `RUH-209` Draft API and event contract v0.1 from current docs
- `RUH-210` Define MVP success metrics and phase gate criteria
- `RUH-211` Publish engineering ready and done conventions for RUH issues
- `RUH-212` Decide monorepo topology and package boundaries
- `RUH-213` Scaffold workspace tooling and CI baseline
- `RUH-216` Define canonical entities and ID conventions
- `RUH-217` Define task, artifact, and approval lifecycle states

Next cycle runway

- `RUH-214` Scaffold control plane API and worker service shells
- `RUH-215` Scaffold compiler, pack, and connector package shells
- `RUH-218` Define deployment bundle, runtime environment, and drift schemas
- `RUH-219` Define connector install, secret ref, and role mapping schemas
- `RUH-220` Define compiler input and output contract and bundle layout
- `RUH-221` Implement manifest loading and validation skeleton
- `RUH-222` Define OpenClaw runtime adapter contract
- `RUH-223` Implement runtime manager apply, status, and drift skeleton
- `RUH-226` Define workflow graph DSL and execution contract
- `RUH-228` Implement work item and task transition engine skeleton
- `RUH-230` Define artifact storage contract and lineage model
- `RUH-232` Define risk taxonomy and protected action matrix
- `RUH-234` Implement approval request and decision audit model
- `RUH-236` Define secret broker resolution and rotation contract
- `RUH-238` Define telemetry event taxonomy and baseline scorecards
- `RUH-239` Scaffold eval suite registry and execution contract

Key dependency spine

- `RUH-208` blocks `RUH-209` and `RUH-212`
- `RUH-209` blocks `RUH-216`, `RUH-222`, and the Phase 2 connector-contract issues
- `RUH-212` blocks `RUH-213` and `RUH-214`
- `RUH-216` blocks `RUH-217`
- `RUH-218` and `RUH-219` block `RUH-220`
- `RUH-220` blocks `RUH-221` and `RUH-223`
- `RUH-226` blocks `RUH-228`
- `RUH-240` and connector-contract issues gate `RUH-257` overlay compile work

## First Recommended Execution Slice

If only one narrow slice is started immediately, do this:

1. Lock the V1 control-plane boundary and missing interface contracts.
2. Stand up the canonical domain model plus deployment compiler skeleton.
3. Implement the AI BuildOps pack manifest, workflow templates, and overlay compile path.
4. Prove intake-to-spec in draft mode with Linear, Slack, and GitHub context.

That path is the fastest route from documents to a real governed workflow without prematurely broadening into the construction wedge.
