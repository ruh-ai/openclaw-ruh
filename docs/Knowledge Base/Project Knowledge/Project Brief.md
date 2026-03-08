---
type: kb/project-brief
tags:
  - kb/project-knowledge
  - kb/project-brief
---
# Project Brief

Ruh.ai is being positioned as a horizontal platform for creating, deploying, supervising, and improving governed digital employees. It uses OpenClaw as the runtime operating layer and adds a separate control plane for templates, deployment, orchestration, approvals, evals, and analytics.

## Core Thesis
- The product should not become a set of bespoke agents per customer.
- The reusable unit is an employee pack, not a one-off prompt bundle.
- Customer-specific values belong in tenant overlays, not in the shared pack source.
- Every production deployment should map to one tenant trust boundary, not to a shared multi-tenant runtime bus.

## Product Shape
- OpenClaw provides the runtime primitives: agents, workspaces, sessions, routing, tools, hooks, cron, and sandbox controls.
- Ruh.ai adds the enterprise layer: pack registry, overlay compiler, task orchestration, approvals, secrets brokerage, evals, and analytics.
- The preferred collaboration model is typed tasks plus artifacts plus approval states, not free-form agent-to-agent chat.

## First Target Domains
- AI BuildOps: intake, specs, planning, build orchestration, eval gating, release, and post-release learning.
- Construction Project Operations: RFIs, submittals, document control, reporting, and action tracking.

## Deployment Pattern
- Shared control plane across customers.
- Dedicated runtime plane per customer trust boundary.
- Reusable pack source compiled with a tenant overlay into one deployment-ready runtime bundle.

## Operating Constraints To Preserve
- One gateway per customer trust boundary.
- Human approvals on medium-risk and high-risk actions.
- Start with narrow, measurable workflows rather than broad autonomy.
- Keep the customer system of record in the center of the workflow.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Digital Employee Platform PRD|Digital Employee Platform PRD]]
- [[Knowledge Base/Documents/Platform Core/System Design and MVP Execution Blueprint|System Design and MVP Execution Blueprint]]
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
