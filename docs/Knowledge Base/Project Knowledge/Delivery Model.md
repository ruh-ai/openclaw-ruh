---
type: kb/operating-note
tags:
  - kb/project-knowledge
  - kb/delivery
  - kb/pilot
---
# Delivery Model

## Pilot Objective
The current delivery model is built around design-partner pilots. The point is to prove trust and measurable workflow improvement with real customers before broader production rollout.

## Standard Pilot Path
- Qualify the customer and workflow.
- Deploy the pack plus overlay into a bounded environment.
- Prove value against a locked baseline.

## Phase Progression
- Monitor mode: read and observe before write-backs are enabled.
- Draft mode: generate candidate outputs for human review.
- Approval mode: allow governed write-backs behind approvals.
- Constrained autonomy: expand only after evidence thresholds are met.

For MVP planning, monitor mode covers baseline capture plus read-only observation, while draft mode covers human-reviewed outputs with no external write-back.

## Scope Discipline
- Start with one or two workflows, not an entire department.
- Keep the customer system of record central to the process.
- Treat approvals as product behavior, not as an implementation workaround.
- Convert pilot exceptions and user complaints into reusable pack or overlay improvements.

## Success Measures
- Business value: time saved, turnaround reduction, reduced manual coordination.
- Trust: approval quality, operator confidence, willingness to widen scope.
- Technical health: integration reliability, citation quality, runtime stability.
- Adoption: repeat usage, workflow coverage, stakeholder expansion.

## MVP Scorecard
Run one weekly pilot review once monitor mode starts. Use the same scorecard for every gate review, treat three reporting periods as three consecutive weekly reviews, and drop the workflow back at least one phase after any critical trust or policy incident.

| Dimension | Metric | Measure | MVP target |
| --- | --- | --- | --- |
| Business value | Manual touch time delta | Median human handling time per work item versus the locked baseline | Directional improvement in draft mode; sustained improvement for three weekly reviews before autonomy |
| Business value | Turnaround delta | Median elapsed time from intake to completed handoff versus baseline | Directional improvement in draft mode; sustained improvement for three weekly reviews before autonomy |
| Business value | Backlog delta | Overdue or aging work items versus baseline | Downward trend before expansion |
| Trust and quality | Draft usefulness rate | Reviewed drafts accepted with light edits divided by reviewed drafts | `>= 80%` before approval mode |
| Trust and quality | Critical trust incidents | Material factual errors, unsafe actions, or policy violations counted weekly | `0` open critical incidents at every gate |
| Trust and quality | Approval acceptance rate | Approved requests divided by total approval requests | Stable enough to preserve workflow value; repeated rejection patterns block promotion |
| Technical health | Task success rate | Runs completed without operator rescue divided by total runs | No blocking reliability issue before approval; stable range before autonomy |
| Technical health | Audit completeness | Runs with traceable inputs, outputs, approvals, and action logs divided by total runs | `100%` for any write-capable phase |
| Technical health | Connector health | Successful connector checks divided by scheduled checks | No unresolved connector or trust-boundary gap at gate review |
| Adoption | Weekly active pilot users | Distinct pilot users who review or act on outputs each week | Named champions active before approval; broader team usage before autonomy |
| Adoption | Repeat usage rate | Active users returning in consecutive weeks divided by weekly active users | Current team uses the workflow without implementation hand-holding before expansion |

Approval latency should be measured against a workflow-specific SLA agreed at kickoff, because acceptable turnaround differs between meeting prep, issue triage, incident follow-up, and other pilot workflows.

## MVP Phase Gates

### Monitor Mode
**Entry gate**
- Sponsor, workflow owner, IT or admin contact, and rollback owner are named.
- Baseline metrics, representative task samples, and the weekly review cadence are locked.
- Trust boundary, read-only connector access, and audit visibility are approved.
- At least `2-5` champion users commit to using the pilot consistently.

**Success metrics**
- All observed runs remain read-only.
- Workflow map, current handoffs, and approval points are documented with real samples.
- Baseline report is published for manual effort, turnaround, and backlog.
- Logs, costs, and connector health are visible for every observed run.

**Exit gate**
- Representative samples cover the in-scope workflow well enough to score draft quality.
- Approval points are explicit rather than implied.
- Draft review rubric is approved by the workflow owner.
- No unresolved trust-boundary, connector, or observability risk blocks human-facing drafts.

### Draft Mode
**Entry gate**
- Monitor exit criteria are met.
- Draft templates, artifact schemas, and eval rubric are configured.
- No external write permissions are enabled.
- Named reviewers and weekly scorecard owners are confirmed.

**Success metrics**
- Draft usefulness rate is `>= 80%` on the representative sample.
- Critical trust incidents remain at `0`.
- Enough representative tasks are completed to cover normal workflow variation.
- No blocking reliability issue prevents users from reviewing outputs.
- Champion users engage consistently in weekly reviews.

**Exit gate**
- The `>= 80%` usefulness threshold is met without unresolved critical trust issues.
- Approval matrix is finalized with named approvers and backup approvers.
- Exact payload previews and rollback steps are verified for each low-risk write-back to be enabled.
- Sponsor and workflow owner explicitly approve the move to approval mode.

### Approval Mode
**Entry gate**
- Draft exit criteria are met.
- Enabled actions are limited to low-risk write-backs with explicit payload preview.
- Named approvers, escalation path, incident channel, and rollback authority are live.
- Audit trail records the request, decision, execution result, and rollback history.

**Success metrics**
- Approval latency stays within the workflow SLA agreed at kickoff.
- Business value is clearly above the locked baseline.
- Critical policy failures remain at `0`.
- Task success rate and connector health stay within the agreed operating range.
- Approvers and operators can explain why actions were proposed and executed.

**Exit gate**
- Three consecutive weekly reviews are stable.
- Business value improvement is sustained across those three reviews.
- No critical policy failure or unresolved trust issue remains open.
- The current team uses the workflow repeatedly without implementation hand-holding.

### Constrained Autonomy
**Entry gate**
- Approval exit criteria are met.
- Only pre-approved low-risk actions are eligible for autonomous execution.
- Kill switch, rollback path, and rollback owner are tested.
- Operators can reconstruct every run from logs, artifacts, and policy decisions.

**Success metrics**
- Autonomous actions stay inside the agreed operating range for quality, latency, and reliability.
- Critical trust incidents remain at `0`.
- Critical policy failures remain at `0`.
- Audit completeness stays at `100%`.
- Usage expands beyond the initial champion group.

**Exit gate**
- Production or expansion plan is approved.
- Support handoff is complete.
- Pilot closeout report is signed off.
- Pack, overlay, approval, and eval deltas are captured as reusable defaults or backlog items.

Destructive or high-risk actions remain human-only in the MVP even after constrained autonomy is enabled.

## Implementation Implication
The project is still framed more as a deployment blueprint than as a finished product surface. The pilot runbook is therefore a critical source of truth, not just supporting documentation.

## Source Notes
- [[Knowledge Base/Documents/Pilot Delivery/Design Partner Pilot Blueprint and Rollout Runbook|Design Partner Pilot Blueprint and Rollout Runbook]]
- [[Knowledge Base/Documents/Tenant Overlays/AI BuildOps Tenant Overlay Kit|AI BuildOps Tenant Overlay Kit]]
- [[Knowledge Base/Documents/Tenant Overlays/Construction Tenant Overlay Kit|Construction Tenant Overlay Kit]]
- [[Knowledge Base/Documents/Reference Packs/AI BuildOps Reference Pack|AI BuildOps Reference Pack]]
- [[Knowledge Base/Documents/Reference Packs/Construction Project Operations Reference Pack|Construction Project Operations Reference Pack]]
