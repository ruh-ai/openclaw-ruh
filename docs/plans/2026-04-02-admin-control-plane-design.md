# Admin Control Plane Design

## Goal

Turn `admin-ui` from a thin stats shell into a real super-admin control plane that exposes both platform operations and business-management visibility in one surface.

## Current Problem

The existing admin panel is structurally honest but operationally weak:

- `Dashboard` only shows four counters.
- `Users` supports role/status edits but not org context or access understanding.
- `Agents` is a plain table with no ownership or runtime story.
- `Marketplace` is effectively a placeholder.
- `System` only dumps `/health`.
- The backend already has richer admin-adjacent primitives such as audit events and sandbox reconciliation, but the UI does not make them usable.

This leaves platform admins unable to answer basic questions such as:

- Which orgs are active and what kind are they?
- Which agents belong to which orgs and what runtime state are they in?
- Are there runtime drifts, orphaned containers, or failed sandboxes?
- What risky actions have happened recently?
- What is actually happening in the marketplace?

## Recommended Approach

Use balanced vertical slices instead of a UI-only pass or a backend-only rewrite.

- Add one richer overview endpoint for the landing page.
- Add focused admin reads for organizations, runtime, and marketplace.
- Upgrade existing users and agents reads so their pages become useful.
- Rebuild the admin UI around a stable information architecture:
  - `Overview`
  - `People`
  - `Organizations`
  - `Agents`
  - `Runtime`
  - `Audit`
  - `System`
  - `Marketplace`

This keeps the work bounded while ensuring each new backend addition immediately powers a concrete admin workflow.

## Data Model Direction

### Overview

The admin landing page should answer four questions immediately:

- What is the shape of the platform right now?
- What needs attention?
- Which orgs are driving activity?
- What just happened?

The backend should return:

- User totals by role and status
- Organization totals by kind
- Agent totals by status
- Sandbox totals by state
- Runtime drift summary from reconciliation
- Marketplace totals by listing status and installs
- Recent audit events
- Top org snapshots
- Top listings

### People

Users must be readable in tenant context, not just as standalone accounts.

Each user row should show:

- Role and account status
- Email verification
- Primary org, if present
- Membership summary across developer/customer orgs
- Derived surface access summary
- Created timestamp

### Organizations

Organizations are the missing business-management layer.

Each org summary should show:

- Kind and plan
- Member count
- Active membership breakdown
- Owned agents
- Owned marketplace listings
- Customer installs where relevant

### Agents

The agent surface should connect ownership and runtime rather than listing names only.

Each agent row should show:

- Creator
- Owning org
- Status
- Sandbox count
- Forge sandbox link if present
- Runtime-input/tool/trigger metadata counts when useful

### Runtime

Runtime is the operator surface.

It should expose:

- Sandbox inventory from DB
- Reconciliation items with drift states
- Shared Codex flags
- Gateway reachability where already available
- Safe repair actions for `db_only` and `container_only`

### Audit

Audit should be a first-class page with filters for:

- action type
- target type
- actor type
- outcome
- target id / actor id

### Marketplace

Even without full moderation writes, super-admins should see:

- Listing volume by status
- Pending review load
- Published adoption
- Top installed listings

## UI Direction

Stay within the repo’s existing admin brand language, but remove the placeholder feel:

- Stronger shell with section grouping and global status context
- Dense but readable KPI cards
- Attention panels instead of empty hero space
- Consistent card and table primitives across pages
- Mobile-safe responsive stacking

## Risks And Constraints

- Avoid inventing destructive admin actions without explicit backend safety.
- Prefer additive admin reads over store refactors for this slice.
- Reuse existing reconciliation repair actions rather than widening the repair surface.
- Keep marketplace writes limited unless an existing moderation contract already exists.

## Verification

Manual browser verification is required for:

- Admin login
- Page navigation
- Overview rendering
- User filtering and role/status edits
- Organizations load
- Agents load
- Runtime reconciliation load and repair action behavior
- Audit filters
- Marketplace visibility
- System health rendering

## Expected Follow-On Features

While building, explicitly watch for the next-layer features that will matter:

- org detail drilldowns
- agent detail drawers
- audit correlation by request/session id
- sandbox restart/retrofit controls in UI
- marketplace moderation writes
- billing/plan visibility
- alerting and notification thresholds
