---
type: kb/architecture-note
tags:
  - kb/project-knowledge
  - kb/architecture
---
# Architecture Model

## System Boundary
Ruh.ai is described as a control plane that deploys and governs digital employees inside isolated OpenClaw runtimes. OpenClaw is the runtime operating layer, not the whole product.

## Control Plane Responsibilities
- Template and pack registry.
- Deployment compiler for pack plus overlay bundles.
- Task-graph orchestration across digital employees.
- Approval policies and auditability.
- Secrets brokerage and connector configuration.
- Eval execution and analytics.

## Runtime Plane Responsibilities
- Agent workspaces and identities.
- Sessions, routing, and channel bindings.
- Tool access and sandbox behavior.
- Hooks, cron jobs, and runtime automation.
- Execution of the compiled employee bundle inside one trust boundary.

## Trust Boundary Model
- The hard boundary is one OpenClaw gateway per tenant trust boundary.
- The platform explicitly avoids treating one shared gateway as a hostile multi-tenant bus.
- Overlay examples show two workspace strategies:
- AI BuildOps uses service-per-workspace.
- Construction uses project-per-workspace.

## Collaboration Model
- The default path is typed tasks, shared artifacts, locks, and approvals.
- Direct agent-to-agent chat exists as a runtime capability but is not the preferred enterprise collaboration primitive.
- Results should flow back into systems of record with citations, approvals, and audit trails.

## Governance Model
- Production packs are expected to be deterministic, versioned, signed, and observable.
- Customer-specific values should stay in overlays.
- Risky external writes should remain approval-gated.
- Curated skills and plugins are the expected production posture.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Digital Employee Platform PRD|Digital Employee Platform PRD]]
- [[Knowledge Base/Documents/Platform Core/System Design and MVP Execution Blueprint|System Design and MVP Execution Blueprint]]
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Overlay Manifest|AI BuildOps Overlay Manifest]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Overlay Manifest|Construction Overlay Manifest]]
