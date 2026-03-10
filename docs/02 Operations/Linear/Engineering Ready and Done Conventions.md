# Engineering Ready and Done Conventions for RUH Issues

Use this note as the minimum handoff bar for RUH issues that shape architecture, schemas, services, connectors, and workflows. These are minimum conventions, not a replacement for issue-specific acceptance criteria.

## Core Rule
- Do not move an issue into active implementation until its definition of ready is met.
- Do not close an issue until its definition of done is met.
- If an issue cannot meet one of these bars, split it, block it, or add the missing upstream issue.

## Minimum Ready For Any Engineering Issue
- The issue names the outcome, the in-scope deliverable, and any explicit non-goals.
- The issue links the current source of truth it depends on, including the relevant ADRs, contracts, schemas, or workflow notes.
- The issue identifies the owning boundary or component and the downstream consumers affected.
- The issue includes reviewable acceptance criteria, not just a topic statement.
- The issue captures any dependency or open question that would force redesign if discovered mid-implementation.
- The issue carries the right track, capability, and scope labels for planning and reporting.

## Minimum Done For Any Engineering Issue
- The promised deliverable exists in the repo and is easy to find from the issue context.
- The issue updates or links every source-of-truth document that changed because of the work.
- The issue leaves downstream teams with a stable contract, decision, or implementation target rather than a new round of ambiguity.
- Any deferred work is split into explicit follow-up issues instead of being left implicit.

## Issue-Type Conventions

| Issue type | Definition of ready | Definition of done |
| --- | --- | --- |
| Architecture | The decision to make is explicit, the competing options or trade-offs are framed, the affected trust boundaries and service boundaries are named, and the downstream issues blocked by the decision are linked. | The chosen direction, rationale, consequences, and non-goals are published in an ADR or equivalent note, and every affected contract or plan note is updated or linked with follow-up work. |
| Schema | The entity, manifest, event, or API surface is named; producers and consumers are identified; lifecycle states, IDs, and versioning expectations are known; and representative examples or edge cases are listed. | The schema is published with field semantics, lifecycle or status rules, validation expectations, versioning guidance, and examples sufficient for downstream implementation without redefining the shape. |
| Service | The service responsibility and boundary are explicit; owned resources, inputs, outputs, and dependencies are identified; the commands, APIs, or events involved are linked; and acceptance covers at least one happy path plus one failure or approval path. | The service contract, owned state, interaction model, and operational expectations are documented or implemented as promised, including telemetry, auditability, retries or failure handling, and any protected-action behavior. |
| Connector | The target system, trust boundary, and tenant-specific assumptions are identified; the read and write scope is explicit; auth and secret-reference needs are known; and rate-limit, failure, and health expectations are captured. | The connector contract or implementation documents the install shape, auth model, secret handling, role mapping, read and write operations, health signals, and approval gates for any protected write-back. |
| Workflow | The business outcome, trigger, completion signal, phase target, participating actors, required connectors, produced artifacts, and approval points are explicit; the happy path and at least one exception path are described. | The workflow definition or implementation makes tasks, transitions, artifacts, approvals, escalation behavior, and observability explicit, and includes a canonical end-to-end example that can be reviewed without treating transcripts as business state. |

## Project-Specific Notes
- For architecture issues, treat `docs/Knowledge Base/Project Knowledge/V1 Boundary and Non-Goals ADR.md` as a required input whenever the change could alter scope, trust boundaries, or gateway assumptions.
- For schema and service issues, treat `docs/Knowledge Base/Project Knowledge/Internal API and Event Contract v0.1.md` as a required input unless the issue is replacing part of that contract.
- For workflow issues, align acceptance with `docs/Knowledge Base/Project Knowledge/Delivery Model.md`, especially the monitor, draft, approval, and constrained-autonomy phase gates.
- For connector issues, keep tenant-specific settings in overlay or follow-up issues whenever the core connector contract can stay reusable.

## Practical Use In Linear
- Put the issue-specific acceptance criteria in the Linear issue body.
- Link the governing docs directly in the issue body or attachments.
- If ready fails because the contract is missing, create the missing upstream issue instead of letting implementation absorb the design work.
- If done fails because the work produced a new dependency, create and link the follow-up issue before closing the current one.
