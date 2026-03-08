---
type: kb/glossary
tags:
  - kb/project-knowledge
  - kb/glossary
---
# Glossary

## Digital Employee
A governed AI worker that operates inside an OpenClaw runtime and participates in typed workflows, artifacts, and approvals.

## Employee Pack
The highest-level reusable Ruh.ai source artifact. It packages customer-neutral employee roles, workflow contracts, schemas, governance rules, and eval suites.

## Reference Pack
A concrete reusable pack for a domain or function. The vault includes AI BuildOps and Construction Project Operations examples.

## Tenant Overlay
The customer-specific binding layer that maps a reusable pack into one real environment, trust boundary, tool stack, and policy context.

## Overlay Manifest
The machine-readable YAML form of the overlay that captures connectors, workflows, role mappings, trust boundary, and policy defaults.

## Trust Boundary
The isolation boundary for one customer runtime deployment. The source docs repeatedly treat one gateway per tenant trust boundary as a hard constraint.

## Control Plane
The Ruh.ai layer responsible for authoring, deployment, orchestration, approvals, evals, analytics, and other cross-tenant product behavior.

## Runtime Plane
The OpenClaw execution layer that hosts agents, workspaces, sessions, routing, hooks, cron, and tool access within a trust-bounded environment.

## System Of Record
The external product that remains authoritative for a workflow domain, such as GitHub, Linear, Procore, or SharePoint. Ruh.ai is meant to orchestrate around these systems, not replace them.

## Design Partner Pilot
A bounded, measured customer deployment used to prove trust, value, and operational readiness before production expansion.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Digital Employee Platform PRD|Digital Employee Platform PRD]]
- [[Knowledge Base/Documents/Platform Core/System Design and MVP Execution Blueprint|System Design and MVP Execution Blueprint]]
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
- [[Knowledge Base/Documents/Pilot Delivery/Design Partner Pilot Blueprint and Rollout Runbook|Design Partner Pilot Blueprint and Rollout Runbook]]
