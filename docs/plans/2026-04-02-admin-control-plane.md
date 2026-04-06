# Admin Control Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a usable super-admin control plane that exposes platform operations and business-management visibility across users, orgs, agents, runtime, audit, marketplace, and system health.

**Architecture:** Extend the backend with additive admin-read endpoints and richer response shapes, then rebuild `admin-ui` around those concrete surfaces. Keep mutations constrained to existing safe operations such as user edits and runtime reconciliation repairs while the rest of the panel remains read-heavy and operationally informative.

**Tech Stack:** Bun, Express, PostgreSQL, Next.js 15, React 19, Tailwind v4

---

### Task 1: Document the approved design and active work

**Files:**
- Modify: `TODOS.md`
- Create: `docs/plans/2026-04-02-admin-control-plane-design.md`
- Create: `docs/knowledge-base/specs/SPEC-admin-control-plane.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/015-admin-panel.md`

**Step 1: Write the approved design and active TODO entry**

Capture the approved information architecture, backend contract, verification scope, and active task context before code changes.

**Step 2: Add the KB spec**

Document the new admin control-plane scope, affected modules, backend endpoints, and UI surfaces with Obsidian wikilinks.

**Step 3: Link the KB**

Update the admin-panel note and the KB index so the new spec is discoverable.

### Task 2: Expand backend admin read endpoints

**Files:**
- Modify: `ruh-backend/src/app.ts`
- Reference: `ruh-backend/src/userStore.ts`
- Reference: `ruh-backend/src/orgStore.ts`
- Reference: `ruh-backend/src/organizationMembershipStore.ts`
- Reference: `ruh-backend/src/agentStore.ts`
- Reference: `ruh-backend/src/store.ts`
- Reference: `ruh-backend/src/auditStore.ts`

**Step 1: Add `GET /api/admin/overview`**

Return a single dashboard payload containing counts, runtime drift summary, recent audit events, org snapshots, and marketplace snapshots.

**Step 2: Add `GET /api/admin/organizations`**

Return org summaries with member counts, role mix, owned agents, owned listings, and install counts.

**Step 3: Add `GET /api/admin/runtime`**

Return sandbox inventory plus reconciliation information for runtime operations.

**Step 4: Add `GET /api/admin/marketplace`**

Return listing-status totals, top listings, pending review count, and recent listings.

**Step 5: Enrich existing user and agent routes**

Include org and membership context for users, and ownership/runtime context for agents.

### Task 3: Rebuild the admin shell and pages

**Files:**
- Modify: `admin-ui/app/(admin)/layout.tsx`
- Modify: `admin-ui/app/(admin)/dashboard/page.tsx`
- Modify: `admin-ui/app/(admin)/users/page.tsx`
- Modify: `admin-ui/app/(admin)/agents/page.tsx`
- Modify: `admin-ui/app/(admin)/marketplace/page.tsx`
- Modify: `admin-ui/app/(admin)/system/page.tsx`
- Modify: `admin-ui/app/globals.css`
- Create: `admin-ui/app/(admin)/organizations/page.tsx`
- Create: `admin-ui/app/(admin)/runtime/page.tsx`
- Create: `admin-ui/app/(admin)/audit/page.tsx`

**Step 1: Upgrade the shell**

Add the new nav structure, global admin context, and a more useful page container.

**Step 2: Rebuild Overview**

Use the new overview endpoint to render KPI cards, warnings, top orgs, top listings, runtime drift, and recent audit activity.

**Step 3: Rebuild People and Agents**

Add richer filters and better ownership/org/runtime context.

**Step 4: Add Organizations, Runtime, and Audit pages**

Implement the missing control-plane surfaces.

**Step 5: Replace Marketplace and System placeholders**

Turn placeholder pages into operational views using the new backend reads.

### Task 4: Verify in the browser

**Files:**
- Runtime only

**Step 1: Start the backend and admin UI**

Use the local seeded admin account for verification.

**Step 2: Verify admin login and navigation**

Ensure every page renders and the shell navigation works.

**Step 3: Verify core admin actions**

Check user role/status edits, runtime repair action behavior, and audit filtering.

**Step 4: Capture feature observations**

Note the next likely admin features revealed by real usage.

### Task 5: Update KB and journal after implementation

**Files:**
- Modify: `docs/knowledge-base/015-admin-panel.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Create or modify: `docs/journal/2026-04-02.md`

**Step 1: Update KB notes to match shipped behavior**

Document the new endpoints and surface areas.

**Step 2: Append the journal**

Record what changed, what was verified, and what follow-on features were discovered.
