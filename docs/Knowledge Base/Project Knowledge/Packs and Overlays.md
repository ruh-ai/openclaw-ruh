---
type: kb/domain-note
tags:
  - kb/project-knowledge
  - kb/packs
  - kb/overlays
---
# Packs and Overlays

## Canonical Hierarchy
- Pack: the highest-level reusable product artifact for digital employees.
- Reference pack: a concrete reusable operating pack for a domain or function.
- Tenant overlay kit: the deployment companion that maps the pack into a real customer stack.
- Overlay manifest: the machine-readable configuration that captures trust boundary, connectors, workflows, and policies.

## Reuse Model
- Shared logic, workflow contracts, approval patterns, artifact schemas, and eval suites live in the pack.
- Customer-specific mappings, installation references, channels, and role bindings live in the overlay.
- The intended result is one reusable source artifact with many customer deployments, without forking the product.

## AI BuildOps Pack
- Focuses on software and AI-product delivery workflows.
- Covers intake and triage, specification and planning, plan-to-build orchestration, eval gating, release preparation, and incident learning.
- Example delivery stack in the vault: GitHub, Linear, Slack, and Sentry.

## Construction Project Operations Pack
- Focuses on project-admin and document-heavy construction workflows.
- Covers intake and routing, RFI lifecycle, submittal lifecycle, meeting-action sync, and daily or weekly reporting.
- Example delivery stack in the vault: Procore, SharePoint, and Teams.

## Compile Path
1. Author or update the reusable pack.
2. Bind it to one customer environment with a tenant overlay.
3. Compile the pack plus overlay into a runtime bundle.
4. Deploy the bundle into one trust-bounded OpenClaw runtime.
5. Measure approval behavior, workflow quality, adoption, and business impact.

## What Matters Operationally
- Packs should remain customer-neutral by default.
- Overlays should preserve official systems of record rather than replace them.
- Overlay examples in the vault are pilot and first-production oriented, not full-autonomy designs.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
- [[Knowledge Base/Documents/Reference Packs/AI BuildOps Reference Pack|AI BuildOps Reference Pack]]
- [[Knowledge Base/Documents/Reference Packs/Construction Project Operations Reference Pack|Construction Project Operations Reference Pack]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Tenant Overlay Kit|AI BuildOps Tenant Overlay Kit]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Tenant Overlay Kit|Construction Tenant Overlay Kit]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Overlay Manifest|AI BuildOps Overlay Manifest]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Overlay Manifest|Construction Overlay Manifest]]
