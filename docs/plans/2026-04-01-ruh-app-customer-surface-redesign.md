# Ruh App Customer Surface Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Flutter customer shell and core customer-facing surfaces so the app feels like a premium Ruh workspace instead of an internal tool shell.

**Architecture:** Keep the current navigation and data contracts, but introduce a stronger shared shell language plus better page-header and card composition across the installed-agents workspace, marketplace list/detail, and agent detail. Avoid changing backend contracts or the chat/computer-view architecture in this slice.

**Tech Stack:** Flutter, Dart, Riverpod, GoRouter, flutter_test

---

### Task 1: Add failing widget coverage for the new shell/workspace UI

**Files:**
- Modify: `ruh_app/test/screens/agent_list_screen_test.dart`
- Modify: `ruh_app/test/config/marketplace_routes_test.dart`
- Create or modify: `ruh_app/test/config/routes_test.dart`

**Step 1: Write failing tests**

- assert the workspace screen renders a richer header/summary treatment
- assert the marketplace screen shows customer-facing copy instead of internal implementation copy
- assert the shell renders user/org context in the desktop sidebar

**Step 2: Run the focused tests to confirm failure**

Run: `cd ruh_app && flutter test test/screens/agent_list_screen_test.dart test/config/marketplace_routes_test.dart test/config/routes_test.dart`

**Step 3: Implement the minimal UI changes**

- update shell and page headers until the new assertions pass

**Step 4: Re-run the focused tests**

Run: `cd ruh_app && flutter test test/screens/agent_list_screen_test.dart test/config/marketplace_routes_test.dart test/config/routes_test.dart`

### Task 2: Implement the shared shell and workspace redesign

**Files:**
- Modify: `ruh_app/lib/config/routes.dart`
- Modify: `ruh_app/lib/config/theme.dart`
- Modify: `ruh_app/lib/screens/agents/agent_list_screen.dart`
- Modify: `ruh_app/lib/widgets/alive_animations.dart` only if needed for reuse

**Step 1: Update the shell**

- add signed-in user/org context to the desktop shell
- strengthen selected-state hierarchy and bottom metadata/footer treatment
- improve mobile top-level framing where possible without changing route structure

**Step 2: Update the agents workspace**

- add a reusable page header / summary block
- improve empty state and card hierarchy
- make the workspace feel like an operational home, not just a list

**Step 3: Re-run targeted tests**

Run: `cd ruh_app && flutter test test/screens/agent_list_screen_test.dart test/config/routes_test.dart`

### Task 3: Redesign marketplace list/detail and customer agent detail

**Files:**
- Modify: `ruh_app/lib/screens/marketplace/marketplace_screen.dart`
- Modify: `ruh_app/lib/screens/marketplace/marketplace_detail_screen.dart`
- Modify: `ruh_app/lib/screens/agents/agent_detail_screen.dart`
- Modify: `ruh_app/test/config/marketplace_routes_test.dart`

**Step 1: Update marketplace list/detail**

- replace implementation-facing copy
- improve hero/filter/list/card rhythm
- improve detail CTA framing and supporting information

**Step 2: Update agent detail**

- make the header/status/CTA customer-first
- push technical metadata lower in the page

**Step 3: Re-run targeted tests**

Run: `cd ruh_app && flutter test test/config/marketplace_routes_test.dart test/screens/agent_list_screen_test.dart`

### Task 4: Restructure settings and complete verification

**Files:**
- Modify: `ruh_app/lib/screens/settings/settings_screen.dart`
- Modify: `docs/knowledge-base/specs/SPEC-ruh-app-customer-surface-redesign.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/knowledge-base/016-marketplace.md`
- Modify: `docs/journal/2026-04-01.md`
- Modify: `TODOS.md`

**Step 1: Update settings information hierarchy**

- lead with account/org context
- keep backend/dev tools available but secondary

**Step 2: Run bounded verification**

Run:
- `cd ruh_app && flutter test test/screens/agent_list_screen_test.dart test/config/marketplace_routes_test.dart test/config/routes_test.dart`
- `cd ruh_app && flutter analyze`
- `git diff --check -- ruh_app docs/knowledge-base docs/journal TODOS.md docs/plans`

**Step 3: Hot restart the running app**

- restart the attached Flutter macOS run session and visually sanity-check the updated surfaces

