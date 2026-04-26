# 016 — Milestone Tracking

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/milestone.schema.json`](schemas/milestone.schema.json)

For pipelines whose customer contracts include performance milestones (ECC's MSA: M2, M4, M6, M12), the spec must encode the milestone definitions, the measurement window, the autonomous-vs-rework classification, the routine-vs-edge denominator, the evidence artifacts, and — critically — the refund formula tied to a missed milestone exit ramp.

This section was added because [008 eval task](008-eval-task.md)'s `pass_rate_threshold` is a *quality gate during development*, not a *contractual KPI measured on live production estimates*. They look similar but are not the same.

---

## Why this section exists

Codex's adversarial review (PR #123 commit history) identified that v1 had no contractible representation of ECC's M6 milestone:

> "75%+ routine estimate types handled end-to-end with only lead-estimator sign-off"
>
> *Routine estimate type*: a general estimate for an existing building having its exterior redone — any combination of new siding, new paint, and/or roof work (or any subset à la carte). Edge cases (specialty-trade-heavy, ground-up, commercial/industrial) are excluded from the denominator.
>
> **Exit ramp**: ECC may terminate with pro-rated Build Fee refund = $30K × (6 − months elapsed) / 12, capped at 50%.

Without this section, pipelines that ship with milestone obligations have nowhere to declare:

- **What goes in the denominator** (routine-vs-edge classification rules)
- **What counts as autonomous** (rework definition, lead-estimator-only sign-off)
- **The measurement window** (rolling N days, calendar months from go-live, etc.)
- **The pass-rate formula** (autonomous count / denominator)
- **The threshold** (e.g., 75%)
- **The refund mechanism** (formula, cap, trigger conditions)
- **Evidence artifacts** (per-estimate decisions that prove the classification)

This section closes that gap. ECC, the second customer with milestone clauses, the third — all use the same machinery.

## Pipeline declaration

Pipelines with milestone obligations declare them in `pipeline-manifest.json`:

```json
{
  "milestones": {
    "go_live_at": "2026-06-15T00:00:00Z",
    "definitions": [
      {
        "id": "M2",
        "name": "Autonomous estimate packages produced",
        "trigger": { "kind": "after_go_live", "duration": "P2M" },
        "metric": {
          "kind": "absolute_count",
          "target": 5,
          "comparison": ">="
        },
        "qualifying_filter": { "deliverable_completeness": ">= 0.9" },
        "evidence_required": ["estimate_session_ids"]
      },
      {
        "id": "M4",
        "name": "Convergence within tolerance",
        "trigger": { "kind": "after_go_live", "duration": "P4M" },
        "metric": {
          "kind": "tolerance_convergence",
          "comparison_window": { "kind": "rolling", "duration": "P30D" },
          "tolerance_percent": 5
        },
        "evidence_required": ["per_deliverable_deltas"]
      },
      {
        "id": "M6",
        "name": "75% routine estimates autonomous",
        "trigger": { "kind": "after_go_live", "duration": "P6M" },
        "metric": {
          "kind": "pass_rate",
          "comparison_window": { "kind": "rolling", "duration": "P30D" },
          "denominator": {
            "kind": "filtered_estimates",
            "filter": { "estimate_kind": "routine" }
          },
          "numerator": {
            "kind": "autonomous_count",
            "definition": {
              "rework_threshold": "lead_estimator_signoff_only",
              "human_intervention_disqualifies": true
            }
          },
          "target": 0.75,
          "comparison": ">="
        },
        "exit_ramp": {
          "kind": "pro_rated_refund",
          "formula": "build_fee * (target_months - months_elapsed) / 12",
          "build_fee_usd": 30000,
          "target_months": 6,
          "cap_fraction": 0.5
        },
        "evidence_required": ["per_estimate_classification", "per_estimate_signoff_chain"]
      },
      {
        "id": "M12",
        "name": "90-95% routine estimates autonomous",
        "trigger": { "kind": "after_go_live", "duration": "P12M" },
        "metric": {
          "kind": "pass_rate",
          "denominator": { "kind": "filtered_estimates", "filter": { "estimate_kind": "routine" } },
          "numerator": {
            "kind": "autonomous_count",
            "definition": { "rework_threshold": "lead_estimator_signoff_only" }
          },
          "target": 0.90,
          "comparison": ">="
        }
      }
    ],
    "classification_function": "milestones/classify-estimate-kind.ts",
    "rework_function": "milestones/detect-rework.ts"
  }
}
```

`classification_function` and `rework_function` are pipeline-supplied functions invoked at evaluation time. They translate raw estimate sessions into the `{estimate_kind, was_autonomous}` tuple the milestone evaluator needs.

## Estimate classification

Every completed estimate session gets classified along two axes:

### Estimate kind (denominator membership)

```ts
type EstimateKind =
  | "routine"          // counts toward routine denominator
  | "edge_specialty"    // excluded — specialty-trade-heavy
  | "edge_ground_up"    // excluded — new construction
  | "edge_commercial"   // excluded — commercial/industrial out of routine band
  | "unclassifiable";   // session lacks data to classify; flagged for human review
```

The `classification_function` returns one of these values per session. ECC's classifier:

- `routine` if scope_keywords match `{"painting", "siding", "roofing"} ∩ kind != ground_up ∩ property_type == multifamily`
- `edge_specialty` if scope contains specialty trades requiring custom skill
- `edge_ground_up` if intake flags new construction
- `edge_commercial` if property_type ∉ {multifamily, residential}

Classification runs **once per estimate session** and is recorded as a `milestone_classification` decision-log entry. Re-classification requires a milestone admin action and is logged as `milestone_reclassification` with the reason.

### Autonomous status (numerator membership)

```ts
type AutonomousStatus =
  | "autonomous"        // produced end-to-end with only lead-estimator sign-off
  | "minor_correction"   // small text/format edits but no quantity/rate changes
  | "rework"             // material changes by humans (quantities, rates, scope)
  | "abandoned"          // human took over completely
  | "in_progress";       // still running; not eligible
```

The `rework_function` examines the session's decision log and post-completion edits to classify. ECC's function:

- `autonomous` if no human edits to deliverables EXCEPT lead-estimator sign-off action AND no `human_intervention` decisions during run
- `minor_correction` if edits are confined to narrative/PPTX wording, not quantity or pricing fields
- `rework` if any edit changed a quantity, rate, scope bucket, or RFQ trade
- `abandoned` if the human regenerated more than 2 deliverables manually

Only `autonomous` counts in the numerator for the 75%/90% thresholds. `minor_correction` is captured for trend analysis but doesn't satisfy the metric.

## Measurement window

```ts
interface MeasurementWindow {
  kind: "rolling" | "calendar_month" | "since_go_live";
  duration?: ISO8601Duration;   // for rolling
  start?: ISO8601Date;          // for since_go_live
}
```

ECC's M6 uses `rolling P30D` evaluated at `T = go_live + 6 months`. Other pipelines may use calendar months or trailing windows.

The runtime evaluates milestones on a schedule (default daily, configurable). Each evaluation is a `milestone_evaluated` decision-log entry with metric value, target, and pass/miss verdict.

## Exit ramp (refund formula)

Milestones with refund clauses declare:

```ts
interface ExitRamp {
  kind: "pro_rated_refund" | "fixed_refund" | "termination_only" | "service_credit";
  formula?: string;          // expression evaluated against milestone state
  build_fee_usd?: number;
  target_months?: number;
  cap_fraction?: number;     // max refund as fraction of build_fee
  cap_usd?: number;          // alternative absolute cap
}
```

ECC's M6 ramp:

- `formula = build_fee * (target_months - months_elapsed) / 12`
- `build_fee_usd = 30000`, `target_months = 6`, `cap_fraction = 0.5`
- At month 0: refund = $30K × 6/12 = $15K (capped at 50% = $15K)
- At month 6: refund = $30K × 0/12 = $0 (no refund if missed exactly at target)
- Between: linear pro-rata

The runtime computes the refund whenever `milestone_evaluated` for M6 reports a miss and the customer triggers exit. The result is a `milestone_exit_ramp_triggered` decision-log entry with the computed refund amount.

**The runtime does NOT initiate refund payment.** It computes the obligation and surfaces it for finance/legal action. Payment lives outside the spec's scope.

## Evidence artifacts

Every milestone evaluation produces structured evidence:

```ts
interface MilestoneEvidence {
  milestone_id: string;
  evaluated_at: ISO8601DateTime;
  window: MeasurementWindow;
  metric_value: number;
  target: number;
  comparison: ">=" | "<=" | "==" | ">" | "<";
  passed: boolean;
  denominator: {
    total: number;
    breakdown: Record<EstimateKind, number>;
    qualifying: number;
  };
  numerator: {
    total: number;
    breakdown: Record<AutonomousStatus, number>;
    qualifying: number;
  };
  per_estimate_records: Array<{
    session_id: string;
    estimate_kind: EstimateKind;
    autonomous_status: AutonomousStatus;
    completed_at: ISO8601DateTime;
    deliverables_count: number;
    rework_summary?: string;
  }>;
}
```

Evidence is queryable via the dashboard ([010](010-dashboard-panels.md)) using the `eval-results`-like panel kind, exportable as PDF/CSV/JSON via the same mechanism described in [005 decision log](005-decision-log.md). For ECC, the export is part of the M6 evaluation handoff to the customer.

## Decision-log entries

Milestone events extend the canonical decision-log type set ([005](005-decision-log.md)):

| Type | When | Metadata shape |
|---|---|---|
| `milestone_classification` | An estimate session classified into routine/edge | `{ session_id, estimate_kind, classification_reason }` |
| `milestone_reclassification` | An estimate's kind was changed post-hoc | `{ session_id, from, to, reason, reviewer_identity }` |
| `milestone_autonomy_evaluated` | Rework function ran on a session | `{ session_id, autonomous_status, rework_summary }` |
| `milestone_evaluated` | Periodic milestone evaluation produced a verdict | `MilestoneEvidence` shape |
| `milestone_exit_ramp_triggered` | Customer triggered exit; runtime computed refund | `{ milestone_id, refund_usd, computation_trace }` |
| `milestone_signoff_recorded` | Lead estimator signed off on an autonomous estimate | `{ session_id, signoff_identity, signoff_at }` |

These types are added to the `DecisionType` enum in [005](005-decision-log.md) and `decision-log.schema.json` (see Patch 3 commit).

## Hooks

| Hook | Fired when |
|---|---|
| `milestone_evaluated` | After each periodic evaluation (sync handlers can post to dashboards) |
| `milestone_missed` | When a passed milestone is missed in a subsequent evaluation (or first miss at trigger time) |
| `milestone_signoff_required` | A routine estimate completed and is awaiting lead-estimator sign-off |
| `milestone_exit_ramp_triggered` | Customer-initiated exit triggers refund computation |

These slot into [013 hooks](013-hooks.md) as additive canonical hook names.

## Anti-example

**Counting minor corrections as autonomous:**

```ts
function detectRework(session) {
  return session.human_edits.length > 0 ? "rework" : "autonomous";
  // ❌ doesn't distinguish copy-edits from material changes; inflates the autonomy rate
}
```

The function must inspect *what* was edited. Quantity/rate/scope changes count as rework; copy-edits to narrative don't. Pipelines that conflate the two will report inflated metrics that shatter the customer's trust at first audit.

**Using eval pass_rate as M6:**

```json
{
  "id": "M6",
  "metric": { "kind": "eval_pass_rate", "target": 0.75 }
  // ❌ eval pass_rate measures dev-time conformance against curated tasks,
  //    not live-production autonomy on real customer estimates
}
```

The eval suite is a development quality gate. M6 is a production performance metric. They look similar (both 75% thresholds). They are NOT the same. The `metric.kind: pass_rate` declared here uses live-production data scoped to the measurement window, not eval-task results.

## Cross-references

- [[005-decision-log]] — milestone events as new decision types
- [[008-eval-task]] — eval pass_rate is dev-time; this section's pass_rate is production
- [[010-dashboard-panels]] — milestone evidence rendered via panels
- [[011-pipeline-manifest]] — `milestones` field declares definitions per pipeline
- [[013-hooks]] — milestone-event hooks
- [[101-conformance]] — milestone definitions validated as part of pipeline conformance

## Open questions for ECC pipeline

- Lead-estimator sign-off as the rework discriminator — what if Darrow batch-approves 20 estimates without reading them carefully? The spec assumes a "thoughtful sign-off"; how do we operationalize that without surveillance? **Tentative**: the dashboard surfaces sign-off latency per estimate; absurdly fast batch approvals get flagged for follow-up audit but still count as sign-off. Trust ECC's operational discipline; do not police the human.
- M6 evaluation cadence — daily, weekly, or only at the 6-month mark? **Tentative**: daily evaluations starting at month 4, with the official M6 verdict locked at the 6-month anniversary. Daily eval gives early warning.
- Edge-classification disputes — what if ECC says an estimate was edge but the agent classified it routine? **Tentative**: post-hoc reclassification via dashboard form is allowed for the lead estimator; reclassifications are audit-logged with reason and reviewer. The 6-month locking moment freezes classifications.
- Refund triggering authority — does ECC's CEO trigger or does the lead estimator? **Tentative**: pipeline-declared in the manifest's `exit_ramp.authorized_triggers` field (defer to v1.1 schema enrichment).
