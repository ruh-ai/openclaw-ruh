---
type: kb/decision-note
tags:
  - kb/decision-note
  - kb/project-knowledge
  - kb/architecture
created: 2026-03-09 22:58
status: accepted
---
# V1 Boundary and Non-Goals ADR

## Decision

### Control-Plane Versus Runtime Boundary
- The shared Ruh.ai control plane owns reusable definitions and governed coordination: template registry, pack and overlay inputs, deployment compiler, runtime inventory, task-graph orchestration, approvals, secret references, eval suites, analytics, deployment status, and audit records.
- The OpenClaw runtime plane owns in-boundary execution: gateways, agent identities, workspaces, sessions, routing, channels, tool execution, hooks, cron, sandbox behavior, and execution of compiled bundles.
- The control plane manages deployments into runtimes, but it does not collapse all tenants into one shared execution substrate or carry shared runtime state across trust boundaries.
- Packs remain customer-neutral, overlays carry customer-specific configuration, and runtime bundles are compiled outputs rather than hand-authored tenant workspaces.

### Trust Model
- V1 uses one dedicated OpenClaw gateway per customer trust boundary.
- A trust boundary is the unit of runtime isolation, deployment ownership, connector scoping, and audit review.
- Workspace topology may vary by overlay, such as service-per-workspace or project-per-workspace, but those workspaces still live inside one boundary-owned runtime.
- Ruh.ai V1 must not treat one shared gateway as a hostile multi-tenant bus.

### V1 In-Scope Capabilities
- Create digital employees from versioned templates and deploy them as compiled pack-plus-overlay bundles.
- Orchestrate collaboration through typed tasks, artifacts, approval states, and policy-gated actions.
- Run governed connector actions with secrets brokerage, scoped secret references, and auditable results pushed back into systems of record.
- Observe deployments and runtime health per trust boundary, including applied bundle state, drift signals, eval execution, and outcome analytics.
- Support reusable horizontal packs and tenant overlays without bespoke per-customer forks.

### Explicit Non-Goals
- A shared multi-tenant OpenClaw gateway that mixes hostile customers in one runtime plane.
- Free-form agent-to-agent chat as the primary enterprise collaboration contract.
- Replacing customer systems of record such as GitHub, Linear, Slack, Procore, SharePoint, or Teams.
- Unbounded autonomous production actions; risky external writes remain approval-gated or human-only.
- Bespoke customer implementations that bypass pack, overlay, and deployment-compiler contracts.
- A general marketplace of arbitrary plugins, skills, or custom runtime mutations outside curated and governed pack inputs.

## Context
The PRD frames Ruh.ai as a horizontal digital employee operating system built on top of OpenClaw gateway runtimes. The V1 system design narrows that ambition to a shared control plane plus a dedicated runtime plane per trust boundary, with typed tasks and artifacts as the default collaboration model. The pack specification separates reusable customer-neutral packs from customer-specific overlays, and the sample overlays show trust-boundary-owned deployments with different workspace strategies.

This ADR fixes those choices as V1 implementation rules so product, platform, and solution work all target the same boundary.

## Tradeoffs
- Dedicated runtimes increase operational overhead compared with a single shared gateway, but they keep isolation, connector scoping, and deployment ownership legible.
- Typed tasks, artifacts, and approvals are less flexible than free-form chat, but they provide the auditability and system-of-record integration expected in production workflows.
- Constraining V1 to governed packs and overlays reduces near-term customization freedom, but it prevents the platform from devolving into one-off agent projects.

## Follow-up
- Use this ADR as the scope gate for V1 data model, deployment compiler, runtime manager, secrets broker, and workflow orchestration work.
- Keep future roadmap items explicit when they cross this boundary, especially shared-runtime ideas, new autonomy levels, or system-of-record replacement proposals.
- Revisit the ADR when the missing API and Event Contract Specification is available, but do not expand V1 scope without a new decision note.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Digital Employee Platform PRD|Digital Employee Platform PRD]]
- [[Knowledge Base/Documents/Platform Core/System Design and MVP Execution Blueprint|System Design and MVP Execution Blueprint]]
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Overlay Manifest|AI BuildOps Overlay Manifest]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Overlay Manifest|Construction Overlay Manifest]]
