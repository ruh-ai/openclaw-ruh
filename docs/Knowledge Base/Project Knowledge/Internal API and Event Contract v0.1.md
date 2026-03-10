---
type: kb/working-note
tags:
  - kb/working-note
  - kb/project-knowledge
  - kb/api-contract
  - kb/architecture
created: 2026-03-10 07:11
status: draft
version: 0.1
---
# Internal API and Event Contract v0.1

## Context
- The current source set repeatedly references a V1 API and Event Contract Specification, but that source document is missing from the repository.
- Phase 0 and Phase 1 work still need a stable internal contract for the core control-plane APIs, command vocabulary, event vocabulary, and artifact envelopes.
- This note is the internal replacement draft until the original source is recovered or a fuller transport-level specification supersedes it.

## Scope
- This draft is normative for Phase 0 and Phase 1 design and scaffolding work.
- It covers the minimum contract for core resources, logical APIs, commands, events, and artifact envelopes.
- It does not try to define connector-specific payloads, low-level OpenClaw runtime APIs, auth transport details, or Phase 2 workflow-specific schemas.

## Contract Rules
- One `runtimeEnvironment` maps to one tenant trust boundary.
- The Ruh.ai control plane owns templates, packs, overlays, bundles, deployments, work items, tasks, artifacts, approvals, secret references, evals, and analytics.
- The OpenClaw runtime plane owns workspaces, sessions, routing, channels, tools, hooks, cron, and in-boundary execution state.
- Typed tasks, shared artifacts, locks, and approval states are the default collaboration contract.
- Customer systems of record remain authoritative; Ruh.ai orchestrates around them and writes back with citations, approvals, and auditability.

## Core Resource Model

### Common Resource Envelope
Every Phase 0 and Phase 1 resource should fit this logical shape even if the transport changes later:

```json
{
  "apiVersion": "ruh.ai/v0.1",
  "kind": "<resourceKind>",
  "metadata": {
    "id": "<opaque-id>",
    "tenantId": "<tenant-id>",
    "environmentId": "<runtime-environment-id>",
    "createdAt": "2026-03-10T07:11:00Z",
    "updatedAt": "2026-03-10T07:11:00Z",
    "labels": {},
    "externalRefs": []
  },
  "spec": {},
  "status": {
    "state": "<lifecycle-state>",
    "reason": null
  }
}
```

### Canonical Resource Kinds
- `tenant`: commercial and governance owner for one customer deployment scope.
- `runtimeEnvironment`: one trust-bounded runtime target with gateway mode, runtime profile, workspace strategy, and deployment ownership.
- `workspace`: a runtime workspace inside one environment, usually scoped by service, repo cluster, or project strategy defined by the overlay.
- `pack`: the reusable product artifact that exports employee templates, workflow contracts, artifact schemas, approval patterns, and eval suites.
- `tenantOverlay`: the customer-specific binding layer that selects connectors, policies, workspace strategy, roles, and deployment settings for one environment.
- `employeeTemplate`: reusable role definition exported by a pack.
- `employeeInstance`: a deployed employee bound to one template, workspace, and environment.
- `workItem`: the top-level tracked unit of business work for one workflow run.
- `task`: a typed unit of execution inside a work graph, with explicit inputs, outputs, retries, deadlines, assignment, and escalation state.
- `artifact`: a durable output, receipt, bundle, or report with lineage.
- `approval`: a governed decision record for a protected action or promotion gate.
- `secretReference`: a control-plane reference to a tenant-scoped secret or credential lease policy, never the raw secret value itself.
- `deployment`: the desired and applied state of a pack plus overlay bundle in one runtime environment.
- `runTelemetry`: per-run or per-task operational measurements, quality samples, and outcome metrics.

### Minimum Lifecycle States
- `workItem`: `open`, `in_progress`, `blocked`, `completed`, `canceled`.
- `task`: `queued`, `assigned`, `running`, `awaiting_approval`, `blocked`, `completed`, `failed`, `canceled`.
- `artifact`: `draft`, `published`, `superseded`, `rejected`, `archived`.
- `approval`: `pending`, `approved`, `rejected`, `expired`, `canceled`.
- `deployment`: `planned`, `compiled`, `ready`, `applying`, `applied`, `failed`, `rolled_back`, `drifted`.
- `employeeInstance`: `provisioning`, `ready`, `paused`, `degraded`, `retired`.

## Logical APIs

### Registry API
- Purpose: publish and resolve reusable control-plane inputs.
- Core resources: `pack`, `tenantOverlay`, `employeeTemplate`, `workflowTemplate`, `policyProfile`, `connectorPreset`.
- Required operations: `register`, `list`, `get`, `resolveVersion`, `validateCompatibility`.

### Deployment API
- Purpose: compile pack plus overlay inputs into deterministic runtime bundles and track the result per trust boundary.
- Core resources: `runtimeEnvironment`, `deployment`, `artifact` of type `deploymentBundle`.
- Required operations: `createEnvironment`, `compileBundle`, `previewDiff`, `applyDeployment`, `rollbackDeployment`, `getDeploymentStatus`, `reportDrift`.

### Workflow API
- Purpose: advance governed work without using transcripts as business state.
- Core resources: `employeeInstance`, `workItem`, `task`.
- Required operations: `createWorkItem`, `assignTask`, `startTask`, `completeTask`, `failTask`, `escalateTask`, `listWorkGraph`.

### Artifact API
- Purpose: store structured outputs, lineage, receipts, and cross-workflow references.
- Core resources: `artifact`.
- Required operations: `publishArtifact`, `getArtifact`, `listArtifacts`, `linkLineage`, `supersedeArtifact`.

### Approval API
- Purpose: route and record protected decisions.
- Core resources: `approval`, `artifact` of type `approvalReceipt`.
- Required operations: `requestApproval`, `recordDecision`, `expireApproval`, `getApprovalHistory`.

### Secrets API
- Purpose: resolve scoped secret references into short-lived runtime access without exposing durable secret values in artifacts or manifests.
- Core resources: `secretReference`.
- Required operations: `registerSecretReference`, `resolveSecretReference`, `revokeSecretLease`, `listSecretReferences`.

### Telemetry API
- Purpose: capture runtime health, run quality, costs, eval outcomes, and drift signals.
- Core resources: `runTelemetry`, `artifact` of type `evalReport` or `runtimeSnapshot`.
- Required operations: `recordRunTelemetry`, `recordEvalOutcome`, `recordRuntimeHealth`, `listSignals`.

## Command Envelope
Commands are imperative requests. They may be transported over HTTP, a job queue, or an internal bus, but they should share one logical shape.

```json
{
  "apiVersion": "ruh.ai/v0.1",
  "kind": "command",
  "metadata": {
    "commandId": "<opaque-id>",
    "commandType": "<verbNoun>",
    "requestedAt": "2026-03-10T07:11:00Z",
    "actorRef": {
      "kind": "user",
      "id": "platform-operator"
    },
    "tenantId": "<tenant-id>",
    "environmentId": "<runtime-environment-id>",
    "correlationId": "<trace-id>",
    "causationId": null
  },
  "spec": {
    "dryRun": false,
    "payload": {}
  }
}
```

## Core Commands
- `RegisterPackRelease`: publish a versioned reusable pack release into the registry.
- `RegisterTenantOverlay`: publish or update an overlay definition for one customer context.
- `ValidateOverlayCompatibility`: verify that a pack, overlay, policy profile, and runtime profile are compatible.
- `CompileDeploymentBundle`: compile pack plus overlay inputs into a deterministic `deploymentBundle` artifact.
- `CreateRuntimeEnvironment`: register or provision a trust-bounded target runtime.
- `ApplyDeployment`: apply a compiled bundle to one runtime environment.
- `RollbackDeployment`: move the environment back to a known-good bundle.
- `CreateEmployeeInstance`: materialize an employee from a template into one workspace and environment.
- `CreateWorkItem`: create the top-level workflow run record.
- `AssignTask`: bind a task to an employee instance or operator queue.
- `StartTask`: mark an assigned task as actively executing.
- `PublishArtifact`: persist a task or deployment output and attach lineage.
- `RequestApproval`: open an approval for a protected action, gate review, or autonomy change.
- `RecordApprovalDecision`: record an approver decision and its rationale.
- `RegisterSecretReference`: create or update a tenant-scoped control-plane reference to a secret source or lease policy.
- `ResolveSecretReference`: turn a scoped secret reference into a short-lived runtime lease.
- `RecordRunTelemetry`: persist execution, quality, cost, and latency measurements.
- `ReportRuntimeDrift`: record environment drift between desired and observed runtime state.

## Event Envelope
Events are immutable facts emitted after state changes.

```json
{
  "apiVersion": "ruh.ai/v0.1",
  "kind": "event",
  "metadata": {
    "eventId": "<opaque-id>",
    "eventType": "<nounPastTense>",
    "occurredAt": "2026-03-10T07:11:00Z",
    "tenantId": "<tenant-id>",
    "environmentId": "<runtime-environment-id>",
    "correlationId": "<trace-id>",
    "causationId": "<command-id>"
  },
  "subject": {
    "kind": "<resourceKind>",
    "id": "<resource-id>"
  },
  "data": {}
}
```

## Core Events
- `PackReleaseRegistered`
- `TenantOverlayRegistered`
- `OverlayCompatibilityValidated`
- `DeploymentBundleCompiled`
- `RuntimeEnvironmentCreated`
- `DeploymentApplyRequested`
- `DeploymentApplied`
- `DeploymentRolledBack`
- `RuntimeDriftReported`
- `EmployeeInstanceCreated`
- `WorkItemCreated`
- `TaskAssigned`
- `TaskStarted`
- `TaskBlocked`
- `TaskCompleted`
- `TaskFailed`
- `ArtifactPublished`
- `ApprovalRequested`
- `ApprovalApproved`
- `ApprovalRejected`
- `SecretReferenceRegistered`
- `SecretReferenceResolved`
- `RunTelemetryRecorded`
- `EvalOutcomeRecorded`

## Artifact Envelopes

### Common Artifact Envelope
All durable outputs should use one shared logical envelope:

```json
{
  "apiVersion": "ruh.ai/v0.1",
  "kind": "artifact",
  "metadata": {
    "artifactId": "<opaque-id>",
    "artifactType": "<artifact-type>",
    "schemaRef": "<schema-ref>",
    "tenantId": "<tenant-id>",
    "environmentId": "<runtime-environment-id>",
    "workItemId": null,
    "taskId": null,
    "createdAt": "2026-03-10T07:11:00Z",
    "producerRef": {
      "kind": "employeeInstance",
      "id": "<producer-id>"
    }
  },
  "spec": {
    "summary": "<human-readable summary>",
    "contentType": "application/json",
    "content": {},
    "contentRef": null,
    "citations": []
  },
  "lineage": {
    "sourceArtifactIds": [],
    "sourceTaskIds": [],
    "sourceExternalRefs": [],
    "approvalIds": []
  },
  "integrity": {
    "hash": "sha256:<digest>",
    "sizeBytes": 0
  },
  "status": {
    "state": "published"
  }
}
```

### Required Phase 0 and Phase 1 Artifact Types
- `deploymentBundle`: deterministic compiled output for one pack plus overlay deployment. Minimum content: pack ref, overlay ref, resolved template set, workspace assets, hook refs, routing bindings, policy refs, connector refs, secret refs, compatibility metadata, and integrity digest.
- `workflowOutput`: structured employee output for one task or work item. Minimum content: schema ref, business payload, citations, intended downstream system, and lineage back to the producing task.
- `approvalReceipt`: immutable record of one approval request and decision. Minimum content: approval subject, action class, approver, decision, rationale, and decided timestamp.
- `evalReport`: scored output for a run, workflow slice, or deployment candidate. Minimum content: metric set, rubric or threshold refs, pass-fail outcome, and reviewer or evaluator identity.
- `runtimeSnapshot`: observed runtime inventory or health snapshot. Minimum content: environment id, active bundle ref, workspace inventory, drift summary, and collection timestamp.

## Phase Mapping
- Phase 0 depends on `RegisterPackRelease`, `RegisterTenantOverlay`, `ValidateOverlayCompatibility`, `CompileDeploymentBundle`, and the `deploymentBundle` artifact envelope.
- Phase 1 adds `CreateRuntimeEnvironment`, `ApplyDeployment`, `RollbackDeployment`, `CreateEmployeeInstance`, `CreateWorkItem`, `AssignTask`, `PublishArtifact`, `RequestApproval`, `RecordApprovalDecision`, `RegisterSecretReference`, `ResolveSecretReference`, `RecordRunTelemetry`, and `ReportRuntimeDrift`.
- Phase 2 should extend this draft with workflow-specific schemas, connector action payloads, and pack-export contracts rather than redefining the Phase 0 and Phase 1 nouns.

## Deferred Items
- Transport-specific REST paths, pagination rules, and auth headers.
- External webhook payloads for GitHub, Linear, Slack, Sentry, Procore, SharePoint, and Teams.
- Low-level OpenClaw session, routing, tool, channel, and hook APIs.
- Final pack manifest schema, workflow DSL syntax, and connector capability matrices.
- Public compatibility guarantees beyond the Phase 0 and Phase 1 internal draft.

## Source Notes
- [[Knowledge Base/Documents/Platform Core/Digital Employee Platform PRD|Digital Employee Platform PRD]]
- [[Knowledge Base/Documents/Platform Core/System Design and MVP Execution Blueprint|System Design and MVP Execution Blueprint]]
- [[Knowledge Base/Documents/Platform Core/Employee Pack Specification|Employee Pack Specification]]
- [[Knowledge Base/Documents/Reference Packs/AI BuildOps Reference Pack|AI BuildOps Reference Pack]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Overlay Manifest|AI BuildOps Overlay Manifest]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Overlay Manifest|Construction Overlay Manifest]]
- [[Knowledge Base/Documents/Pilot Delivery/Design Partner Pilot Blueprint and Rollout Runbook|Design Partner Pilot Blueprint and Rollout Runbook]]
