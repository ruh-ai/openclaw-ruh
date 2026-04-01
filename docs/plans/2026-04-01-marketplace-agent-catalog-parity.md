# Marketplace Agent Catalog Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current mock/browse-only marketplace experience with a real agent catalog and listing-detail flow on both customer surfaces using the backend marketplace endpoints that already exist today.

**Architecture:** This slice deliberately stays on the current backend contract instead of waiting for checkout and org entitlements. Both `ruh_app` and `ruh-frontend` will consume `/api/marketplace/listings` and `/api/marketplace/listings/:slug`, expose real list/detail navigation, and keep CTA behavior bounded to what the backend already supports now. The implementation should centralize data parsing per surface, add detail routes first, and then switch the Flutter list screen from hard-coded cards to API-backed state.

**Tech Stack:** Flutter + Riverpod + Dio, Next.js 16 + React, TypeScript, Dart, bun:test, Jest

---

### Task 1: Lock the customer-web detail contract

**Files:**
- Create: `ruh-frontend/__tests__/pages/MarketplaceDetailPage.test.tsx`
- Create: `ruh-frontend/app/marketplace/[slug]/page.tsx`
- Modify: `ruh-frontend/app/marketplace/page.tsx`

**Step 1: Write the failing test**

- Add a Jest test that renders the new detail page, mocks `fetch`, and expects:
  - title
  - description
  - category/install/rating metadata
  - a truthful CTA state based on the current legacy install contract
- Add a list-page regression that verifies catalog cards still point to `/marketplace/[slug]`.

**Step 2: Run test to verify it fails**

Run: `cd ruh-frontend && npx jest __tests__/pages/MarketplaceDetailPage.test.tsx --runInBand`

Expected: fail because the detail page file and/or expected elements do not exist yet.

**Step 3: Write minimal implementation**

- Add `app/marketplace/[slug]/page.tsx`
- Fetch `/api/marketplace/listings/:slug`
- Render listing metadata and a bounded CTA
- Keep the page client-side if that is the easiest fit with the current auth/fetch setup

**Step 4: Run tests to verify they pass**

Run: `cd ruh-frontend && npx jest __tests__/pages/MarketplaceDetailPage.test.tsx --runInBand`

Expected: PASS

---

### Task 2: Replace the Flutter marketplace mock with a real service/model layer

**Files:**
- Create: `ruh_app/lib/models/marketplace_listing.dart`
- Create: `ruh_app/lib/services/marketplace_service.dart`
- Create: `ruh_app/lib/providers/marketplace_provider.dart`
- Create: `ruh_app/test/services/marketplace_service_test.dart`

**Step 1: Write the failing test**

- Add a service test that feeds backend-shaped JSON into the new Dart model/service and expects:
  - list parsing
  - detail parsing
  - query parameter propagation for search/category

**Step 2: Run test to verify it fails**

Run: `cd ruh_app && flutter test test/services/marketplace_service_test.dart`

Expected: fail because the model/service do not exist yet.

**Step 3: Write minimal implementation**

- Add a Dart listing model that matches the current backend response
- Add a marketplace service using `ApiClient`
- Add a provider/notifier that loads listings and listing detail

**Step 4: Run tests to verify they pass**

Run: `cd ruh_app && flutter test test/services/marketplace_service_test.dart`

Expected: PASS

---

### Task 3: Add a real Flutter marketplace detail route and wire the list screen to it

**Files:**
- Create: `ruh_app/lib/screens/marketplace/marketplace_detail_screen.dart`
- Modify: `ruh_app/lib/config/routes.dart`
- Modify: `ruh_app/lib/screens/marketplace/marketplace_screen.dart`
- Create: `ruh_app/test/config/marketplace_routes_test.dart`

**Step 1: Write the failing test**

- Add route/widget tests that expect:
  - a `/marketplace/:slug` route exists
  - tapping a list item navigates to detail
  - the detail screen renders API-backed content

**Step 2: Run test to verify it fails**

Run: `cd ruh_app && flutter test test/config/marketplace_routes_test.dart`

Expected: fail because the route/detail screen do not exist yet.

**Step 3: Write minimal implementation**

- Add the detail route and screen
- Replace mock arrays in `MarketplaceScreen` with provider-backed data
- Preserve current layout quality where possible, but remove hard-coded store content

**Step 4: Run tests to verify they pass**

Run: `cd ruh_app && flutter test test/config/marketplace_routes_test.dart`

Expected: PASS

---

### Task 4: Run focused verification and update docs

**Files:**
- Modify: `docs/knowledge-base/016-marketplace.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/knowledge-base/009-ruh-frontend.md`
- Modify: `docs/journal/2026-04-01.md`
- Modify: `TODOS.md`

**Step 1: Run focused checks**

Run:
- `cd ruh-frontend && npx jest __tests__/pages/MarketplaceDetailPage.test.tsx --runInBand`
- `cd ruh_app && flutter test test/services/marketplace_service_test.dart test/config/marketplace_routes_test.dart`
- `cd ruh_app && flutter analyze`

**Step 2: Verify results**

- Confirm new list/detail behavior is covered
- Confirm typecheck/analyze output is clean enough for this slice

**Step 3: Update docs**

- Mark the customer-web and Flutter marketplace notes as using real backend listings/detail for agents
- Append the daily journal entry
- Update the active TODO with actual results and next slice
