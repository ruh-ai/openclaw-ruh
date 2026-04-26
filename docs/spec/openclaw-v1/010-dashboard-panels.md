# 010 — Dashboard Panels

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/dashboard.schema.json`](schemas/dashboard.schema.json)

Every pipeline ships with a **bespoke operational dashboard** — not a generic chat interface. The dashboard is composed from a fixed library of registered **panel kinds** (queue, timeline, table, form, kpi, map, etc.), instantiated per-pipeline with data sources, user actions, and role visibility. ECC's dashboard has an estimate queue, a gap register, a decision-log explorer, a memory-write approval inbox, a regional-rate config editor, and an orchestrator chat — generated from this panel library.

---

## Purpose

A platform that produces multi-agent fleets cannot also force every customer to use the same chat-only UI. Different pipelines need different surfaces. ECC's reviewers spend 80% of their time in a *queue* of pending estimates, not a chat. Customer-curated training-loop reviewers need a *timeline* of iterations, not a chat. The dashboard panel system is what makes pipeline-specific surfaces possible without turning every pipeline into a custom UI codebase.

The constraints:

- Panels are **fixed-shape, generic, registered**. The pipeline picks from the library and configures them; it does not write panels from scratch.
- Panels are **data-driven**. Their content comes from runtime APIs — decision log, memory, config, eval results — not from custom code.
- Panels are **role-aware**. Different reviewers see different panels (Darrow gets the memory-approval inbox; Scott gets the operational queue).
- Custom panels are **possible but reviewed**. A pipeline may register a custom panel kind, but it requires explicit manifest declaration and a security review (per [101](101-conformance.md)).

## Filesystem layout

A pipeline's `dashboard/` directory:

```
dashboard/
├── manifest.json            # required — panel composition
├── panels/                  # custom panel implementations (rare)
│   └── <custom-id>/
│       ├── component.tsx
│       └── schema.json
└── theme/                   # branding overrides (logo, color tokens)
    └── ...
```

Most pipelines have only `manifest.json` + `theme/`. Custom panels are an escape hatch.

## Top-level `dashboard/manifest.json`

```ts
interface DashboardManifest {
  spec_version: string;
  pipeline_id: string;
  title: string;
  description: string;
  branding: BrandingConfig;
  panels: PanelInstance[];
  navigation: NavigationConfig;
  default_landing_panel: string;     // panel ID
  role_visibility: RoleVisibilityRules;
}
```

The orchestrator agent serves the dashboard via the runtime's static-resolver path. The manifest tells the resolver: "for this pipeline, render these panels in this layout."

## Panel kinds (canonical library)

The runtime ships a fixed set of panel kinds. Each is a typed, schema-validated component fed by data sources.

### `chat`

The orchestrator chat — the catch-all entry point. Every pipeline includes at least one chat panel; it's where users initiate work that doesn't fit a structured panel.

```json
{
  "kind": "chat",
  "id": "orchestrator-chat",
  "title": "Talk to the agent",
  "agent_uri": "openclaw://ecc-estimator/agents/orchestrator@0.1.0",
  "show_decision_log_inline": true,
  "allowed_attachments": ["pdf", "image", "csv"]
}
```

`show_decision_log_inline` toggles whether the agent's decision-log entries appear inline in the chat (transparency mode) or only as a side panel.

### `queue`

A list of pending or in-flight items. Backed by either a config doc, a memory query, or a custom data source.

```json
{
  "kind": "queue",
  "id": "estimate-queue",
  "title": "Estimates in progress",
  "data_source": {
    "kind": "decision-log-query",
    "query": {
      "types": ["session_start"],
      "since": "rolling_30d",
      "filter": { "metadata.dev_stage": "running" }
    },
    "row_template": {
      "title": "{metadata.user_message_excerpt}",
      "subtitle": "Started {timestamp:relative}",
      "status_badge": "{metadata.dev_stage}"
    }
  },
  "actions": [
    { "label": "Open estimate", "kind": "navigate", "to_panel": "estimate-detail", "context": { "session_id": "{session_id}" } },
    { "label": "Pause", "kind": "agent-call", "skill": "pause-session" }
  ],
  "refresh": { "interval_seconds": 30 }
}
```

### `timeline`

A chronological view of events. Used for the convergence-loop's iteration trajectory, decision log explorer, or session history.

```json
{
  "kind": "timeline",
  "id": "convergence-trajectory",
  "title": "Training loop iterations",
  "data_source": {
    "kind": "decision-log-query",
    "query": { "types": ["eval_iteration"] }
  },
  "axes": {
    "x": "metadata.iteration",
    "y": "metadata.pass_rate",
    "secondary_y": "metadata.avg_score"
  }
}
```

### `table`

Structured tabular data. Used for cost breakdowns, RFQ packets, comparison views, and historical-version tables for config docs.

```json
{
  "kind": "table",
  "id": "labor-rate-table",
  "title": "Aurora labor rates — current",
  "data_source": {
    "kind": "config-query",
    "doc_id": "labor-rates",
    "filter": { "region": "aurora" }
  },
  "columns": [
    { "key": "trade", "label": "Trade" },
    { "key": "wage_type", "label": "Wage Type" },
    { "key": "rate", "label": "Rate ($/hr)", "format": "currency" }
  ],
  "actions": [
    { "label": "Edit", "kind": "open-editor", "permission": "config:write:labor-rates" }
  ]
}
```

### `form`

Editable input. Used for memory-write approvals, config edits, and human-supplied corrections during eval review.

```json
{
  "kind": "form",
  "id": "memory-approval",
  "title": "Pending memory writes",
  "data_source": {
    "kind": "memory-pending-query",
    "filter": { "status": "flagged", "lane": "estimating" }
  },
  "form_template": {
    "title_field": "title",
    "body_field": "body",
    "actions": [
      { "label": "Approve", "kind": "memory-confirm" },
      { "label": "Reject", "kind": "memory-reject", "requires_reason": true }
    ]
  },
  "role_visibility": ["lead_estimator"]
}
```

### `kpi`

Single-metric or small-set scoreboard. Used for autonomous-completion-rate, eval-pass-rate, average estimate latency, etc.

```json
{
  "kind": "kpi",
  "id": "autonomous-completion-rate",
  "title": "Autonomous estimates (M6 target: 75%)",
  "data_source": {
    "kind": "metric-query",
    "metric": "eval.pass_rate",
    "aggregation": "rolling_30d_avg"
  },
  "target": 0.75,
  "format": "percentage",
  "alert_on_below_target": true
}
```

### `map`

Geographic visualization. Used for regional rate distribution, multi-property estimating dashboards, project-location overlay.

```json
{
  "kind": "map",
  "id": "regional-coverage",
  "title": "Active projects by region",
  "data_source": {
    "kind": "config-query",
    "doc_id": "active-projects"
  },
  "marker_template": {
    "lat": "lat",
    "lng": "lng",
    "label": "name",
    "tooltip": "Estimate: {estimate_total}"
  }
}
```

### `decision-log-explorer`

Specialized panel for exploring the call tree. Used by reviewers to audit how an agent reached a conclusion.

```json
{
  "kind": "decision-log-explorer",
  "id": "audit-explorer",
  "title": "Decision audit trail",
  "data_source": {
    "kind": "decision-log-query",
    "query": { "session_id": "{context.session_id}" }
  },
  "default_view": "tree",
  "available_views": ["tree", "flat", "timeline"]
}
```

### `eval-results`

Specialized panel for eval-task pass/fail visualization. Used during training-mode pipelines.

```json
{
  "kind": "eval-results",
  "id": "training-results",
  "title": "Latest training iteration",
  "data_source": {
    "kind": "eval-task-query",
    "filter": { "iteration": "latest" }
  },
  "show_deltas": true
}
```

### `custom`

A custom panel registered by the pipeline. Requires a manifest entry plus an implementation in `panels/<id>/`.

```json
{
  "kind": "custom",
  "id": "ecc-pricing-comparator",
  "title": "ECC pricing vs. market",
  "implementation_path": "panels/pricing-comparator/",
  "data_source": { "kind": "custom" },
  "permission_to_register": "ecc-platform-team",
  "security_reviewed_at": "2026-04-15"
}
```

Custom panels go through a security review (per [101 conformance](101-conformance.md)). Most pipelines have zero custom panels — the canonical library covers ~95% of use cases.

## Data sources

Every panel declares a `data_source`. The runtime exposes typed query APIs that data sources reference:

| Data source kind | Backing API |
|---|---|
| `decision-log-query` | The decision-log query API (per [005](005-decision-log.md)) |
| `memory-query` | Memory list + read APIs (filtered to `confirmed` + `permanent`) |
| `memory-pending-query` | Memory entries with status `flagged` or `proposed` (review surfaces only) |
| `config-query` | Config substrate query (per [009](009-config-substrate.md)) |
| `metric-query` | Decision metrics aggregation |
| `eval-task-query` | Eval suite results |
| `workspace-file` | Read a single file from a specialist's workspace |
| `custom` | Pipeline-registered custom data source |

Each kind has a typed query shape; the panel's `data_source` field is validated against the kind's schema.

## User actions

Panels expose actions users can take. Action kinds:

| Action kind | What it does |
|---|---|
| `navigate` | Move the user to another panel (with optional context) |
| `agent-call` | Invoke a specific agent skill (with optional context as input) |
| `memory-confirm` | Confirm a Tier-2/3 memory write (requires authority) |
| `memory-reject` | Reject a Tier-2/3 memory write |
| `config-edit` | Open the config editor for a doc (requires `config:write:<doc_id>` permission) |
| `download` | Export data (CSV, PDF, JSON) |
| `external-link` | Open an external URL (e.g., SharePoint folder) |
| `custom` | Pipeline-registered custom action |

Actions are governed by **permissions**: each action declares the permission required, and the runtime enforces against the authenticated user's role.

## Role visibility

```ts
interface RoleVisibilityRules {
  roles: Array<{
    name: string;                  // e.g., "lead_estimator", "vp_ops", "regional_estimator"
    description: string;
    granted_to: string[];           // identities (emails) or group references
    permissions: string[];          // permission strings
    visible_panels: string[];       // panel IDs this role can see
    landing_panel?: string;         // override default for this role
  }>;
}
```

Example for ECC:

```json
{
  "role_visibility": {
    "roles": [
      {
        "name": "lead_estimator",
        "description": "ECC co-founder; final estimating authority",
        "granted_to": ["darrow@ecc.com"],
        "permissions": ["memory:confirm:estimating", "config:write:labor-rates", "config:write:paint-bands"],
        "visible_panels": ["orchestrator-chat", "memory-approval", "estimate-queue", "convergence-trajectory", "audit-explorer"],
        "landing_panel": "memory-approval"
      },
      {
        "name": "vp_ops",
        "description": "ECC VP Operations",
        "granted_to": ["scott@ecc.com"],
        "permissions": ["memory:confirm:operations", "config:write:response-slas"],
        "visible_panels": ["orchestrator-chat", "estimate-queue", "audit-explorer", "convergence-trajectory"]
      },
      {
        "name": "regional_estimator",
        "description": "ECC regional estimator (Tier-3 memory writer)",
        "granted_to": ["amelia@ecc.com", "jim@ecc.com", "ramirez@ecc.com"],
        "permissions": [],
        "visible_panels": ["orchestrator-chat", "estimate-queue"]
      }
    ]
  }
}
```

When Darrow logs in, he lands on `memory-approval`. Scott lands on `estimate-queue`. Regional estimators see only what they need.

## Refresh and live updates

Panels declare refresh policy:

```ts
interface RefreshConfig {
  interval_seconds?: number;        // poll every N seconds
  on_event?: HookName[];            // refresh when these hooks fire
  manual_only?: boolean;            // user clicks refresh button; no auto-refresh
}
```

Live updates are powered by hook subscriptions: when `eval_iteration_complete` fires, every panel listening on that hook refreshes. The runtime debounces (no panel refreshes more than once per second).

## Branding

```ts
interface BrandingConfig {
  primary_color: string;             // hex
  secondary_color: string;
  accent_color?: string;
  logo_path?: string;                 // relative to dashboard/theme/
  favicon_path?: string;
  font_stack?: string;                 // CSS font-family override
  custom_css_path?: string;            // last-resort customization
}
```

Brand themes propagate to panels automatically — colors flow through CSS variables, fonts through the page-level font-family. ECC's pipeline declares navy/amber to match their existing brand.

## Navigation

```ts
interface NavigationConfig {
  layout: "sidebar" | "topbar" | "hybrid";
  groups: Array<{
    label: string;
    icon?: string;
    panels: string[];                  // panel IDs in display order
    visible_to_roles?: string[];        // role-based group visibility
  }>;
}
```

Navigation is role-aware (per `visible_to_roles`) so users only see groups containing panels they can access.

## Validation

The runtime validates `dashboard/manifest.json` at pipeline load:

| Rule | Failure |
|---|---|
| Schema | Missing required field, wrong type, malformed enum |
| Panel ID uniqueness | Two panels share the same ID |
| Default landing exists | `default_landing_panel` is in `panels[]` |
| Role landing exists | Each role's `landing_panel` (if set) is in their `visible_panels` |
| Custom panels declared | Every `kind: "custom"` panel has an entry in `panels/<id>/` |
| Data sources resolvable | Every data source's referenced doc / metric / panel exists |
| Permissions consistent | Permissions referenced in actions exist in role definitions |

Failures emit `manifest_invalid` per [014](014-error-taxonomy.md) and the dashboard does not load.

## Anti-example — common defects

**Custom panel without security review:**

```json
{ "kind": "custom", "id": "...", "implementation_path": "panels/...", "security_reviewed_at": null }
// ❌ schema requires security_reviewed_at when kind=custom
```

**Action without permission declaration:**

```json
{ "label": "Delete forever", "kind": "config-edit", "doc_id": "labor-rates" }
// ❌ destructive action with no permission requirement; any user with panel visibility can run it
```

The schema requires `permission` on actions that mutate state. The conformance suite verifies action types declared as mutating have permissions set.

**Role with broad visibility but narrow permissions:**

```json
{
  "name": "regional_estimator",
  "permissions": ["memory:confirm:estimating"],   // ❌ Tier-3 writers should not have confirm authority
  "visible_panels": ["orchestrator-chat", "memory-approval"]
}
```

The runtime cross-references with `memory_authority` from the pipeline manifest. A role granted `memory:confirm:<lane>` must include identities listed at Tier-1 in that lane in the pipeline's `memory_authority`. Violations fail validation.

**Live-refresh stampede:**

```json
{ "refresh": { "interval_seconds": 1 } }
// ❌ 1-second poll on a heavy data source like decision-log-query overwhelms the runtime
```

The runtime enforces a minimum 5-second poll interval per panel. The conformance suite warns when panels declare aggressive polling.

## Cross-references

- [[004-memory-model]] — memory-pending-query data source for Tier-2/3 review panels
- [[005-decision-log]] — decision-log-query, decision-log-explorer panel
- [[009-config-substrate]] — config-query data source, config-edit actions
- [[008-eval-task]] — eval-task-query, eval-results panel, convergence trajectory timeline
- [[011-pipeline-manifest]] — `dashboard.manifest_path` references this section's manifest
- [[013-hooks]] — panels subscribe to hooks for live refresh
- [[101-conformance]] — custom panel security review gate

## Open questions for ECC pipeline

- ECC's gap-register panel (Scott called it "the differentiator") — generic table, or a specialized panel kind? **Tentative**: specialized `gap-register` kind in v1.1, after seeing what shape the actual data takes; v1 implements it as a configured `table` panel.
- Real-time photo-batch progress for ECC's vision-manifest stage — does that need a custom progress panel, or fits a `kpi` with sub-progress? **Tentative**: a new canonical kind `progress-cluster` in v1.1; v1 uses a configured `kpi` with `aggregation: count_completed_of_total`.
- Cross-pipeline panels (a portfolio view across multiple ECC tenants for executives) — out of scope for v1 (single-tenant), revisit in v2.
