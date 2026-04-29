# Dashboard Prototype Stage Design

## Context

The builder currently generates a `dashboardPrototype` during Plan, but the operator sees it as a section inside the Plan artifact. That makes the decision to build feel too early: ECC users need to inspect the dashboard workflow before the backend starts creating dashboard files and runtime services.

The current build pipeline is now workspace-first: Think writes PRD/TRD, Plan writes `architecture.json`, and Build runs server-side specialists. The prototype gate should fit that model by reviewing the approved plan before any specialist work begins.

## Decision

Add a real `prototype` lifecycle stage between `plan` and `build`:

`reveal -> think -> plan -> prototype -> build -> review -> test -> ship -> reflect`

Plan approval no longer starts Build. It advances to Prototype. Prototype approval starts the existing server-side Build pipeline.

## Prototype Semantics

The first implementation is a frontend-rendered interactive dashboard prototype generated from `architecturePlan.dashboardPages` and `architecturePlan.dashboardPrototype`. It is not generated dashboard source code and it does not start a sandbox preview server.

The prototype stage should still feel real enough for an operator to judge the design:

- Dashboard page navigation from the planned page list
- Page-level purpose, workflow mapping, required actions, and acceptance checks
- Mock metric cards, tables, charts, activity feeds, and status panels derived from planned components
- A workflow/action rail that exposes approval, blocker, refresh, export, and review actions from the prototype spec
- A clear revision path through `Request Changes` targeting the Plan artifact

The generated dashboard files remain Build output. Build will keep using the approved `dashboardPrototype` to scaffold workflow/action/checklist panels into the real dashboard pages.

## Plan And Discovery Alignment

The Plan output should make fleet decisions visible. If PRD/TRD describe specialist sub-agents, Plan must emit and render `subAgents` clearly, including ownership of skills, trigger, type, and autonomy.

The Think instruction and agent-builder skill docs should align PRD/TRD with the current build pipeline:

- PRD includes Dashboard Prototype Expectations and, when relevant, Multi-Agent/Fleet Requirements
- TRD includes Sub-Agent Ownership and Dashboard Prototype Contract sections
- The agent-builder playbook checklists reflect these sections

## Scope

In scope:

- Add `prototype` to shared lifecycle types, state transitions, backend forge-stage validation, and stage context
- Rename Plan approval copy so it advances to Prototype instead of starting Build
- Add a full Prototype stage UI in `LifecycleStepRenderer.tsx`
- Move existing prototype-preview behavior into a reusable stage-level renderer
- Make sub-agents more prominent in Plan output and plan markdown summaries
- Update prompts/docs/tests

Out of scope:

- Starting a temporary Vite/dashboard preview server before Build
- Writing prototype source files before Build
- Changing the server-side Build specialist architecture

## Verification

- Unit tests prove lifecycle order and gates: Plan advances to Prototype; Prototype gates Build on a usable dashboard prototype
- Stage context tests expose approval in Prototype
- Plan formatter tests include sub-agent markdown summary and prototype summary
- Prompt tests cover PRD/TRD structure and Plan sub-agent/prototype requirements
- Browser verification confirms the live ECC agent can open the Prototype stage and view the interactive dashboard prototype before Build starts
