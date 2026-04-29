# Interactive Dashboard Prototype Design

## Context

The new Prototype stage prevents Build from starting before the operator sees the planned dashboard. That is necessary but not sufficient for operational agents. A read-only dashboard prototype only validates information layout; it does not validate whether the user can do the work the agent is being built to support.

For estimation agents, the Mission Control dashboard is the work surface. Operators need to create an estimate, start the pipeline, track progress, review generated artifacts, resolve blockers, and approve or request revision. If the prototype does not simulate those actions, Build can still produce a dashboard that looks plausible but is not usable.

## Decision

Adopt Option 1: the Prototype stage becomes an interactive simulated dashboard prototype.

The prototype stays frontend-only and does not create sandbox files or call the generated backend. It simulates the core operator workflow from `architecturePlan.dashboardPrototype`:

- create a sample work item, such as an estimate package
- start the planned pipeline
- step through pipeline stages
- show generated artifacts and versions
- expose approval, revision, publish, and blocker actions
- keep an activity log that proves the workflow is understandable before Build starts

Build still generates the real dashboard after Prototype approval. The same `dashboardPrototype` contract is carried into scaffold generation so the built dashboard preserves the operator workflow, pipeline, and artifact review model.

## Contract Changes

`dashboardPrototype` gains optional operational fields in addition to the existing page/workflow/checklist fields:

- `actions[]`: dashboard actions the operator can perform, such as `create_estimate`, `run_pipeline`, `approve_artifact`, or `request_revision`
- `pipeline`: the user-visible pipeline name, trigger action, steps, completion criteria, and failure states
- `artifacts[]`: generated artifacts the agent produces, such as estimate workbook, assumptions log, source evidence map, QA findings, or approval package
- `emptyState`: the call to action shown before any work item exists

These fields are optional for backward compatibility. When missing, the Prototype stage derives a useful simulated pipeline from existing workflows and required actions.

## Prototype Experience

The Prototype stage should show a dashboard shell with:

- page navigation from `dashboardPages`
- a primary action bar for creating work and running the pipeline
- a pipeline tracker with pending/running/done/blocked step states
- an artifact panel with generated artifact status and review controls
- page-specific workflow and acceptance checks
- a simulated activity log
- sub-agent ownership when a fleet is planned

The prototype must remain clearly simulated. It should not pretend that real files, estimates, or approvals were created.

## Estimation Agent Shape

For an ECC estimation dashboard, the PRD/TRD/Plan should describe:

- Estimate/project creation
- Document intake
- OCR/extraction
- quantity takeoff
- pricing and workbook generation
- QA and variance findings
- approval package generation
- publish/archive or SharePoint writeback

The dashboard should track artifacts such as:

- estimate workbook
- source evidence map
- assumptions log
- quantity takeoff summary
- QA findings
- approval packet

## Scope

In scope:

- Extend TypeScript and backend scaffold prototype contracts
- Normalize new fields from Plan markers and workspace JSON
- Update Plan prompts so the architect emits actions, pipeline, and artifacts for dashboard agents
- Update `StagePrototype` to simulate create/run/review/approve flows
- Update generated dashboard prototype panels to display pipeline and artifacts
- Update tests and KB docs

Out of scope:

- Running real pipeline jobs during Prototype
- Creating pre-build dashboard source files
- Guaranteeing every generated backend endpoint is fully implemented by this slice
- Building a production workflow engine

## Verification

- Unit tests cover normalization and view-model derivation for actions, pipeline, and artifacts
- Prototype stage renders a create/run pipeline simulation from the contract
- Backend scaffold tests prove generated dashboard pages include pipeline and artifact sections
- KB documents that dashboard agents require mutating workflows, pipeline tracking, and generated artifact review
- Browser verification confirms the Prototype stage can simulate create estimate, run pipeline, and approve/revise an artifact before Build starts
