# Ruh App Chat-First Agent Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Flutter installed-agent flow open directly into chat and add a first-class `Agent Config` workspace tab backed by a customer-safe runtime config API.

**Architecture:** Reuse `ChatScreen` as the primary customer runtime destination, repurpose the old detail route as compatibility framing, and add a dedicated backend `customer-config` contract for safe operator edits. Keep builder-only agent patch routes untouched, and let the Flutter config tab orchestrate runtime-config plus workspace-memory persistence from one surface.

**Tech Stack:** Flutter, Riverpod, GoRouter, Bun, Express, existing backend validator helpers, Flutter widget/service tests, Bun app-route tests.

---

### Task 1: Lock The Backend Contract In Tests

**Files:**
- Modify: `ruh-backend/tests/unit/customerAgentLaunchApp.test.ts`
- Create or modify: `ruh-backend/tests/unit/customerAgentConfigApp.test.ts`
- Reference: `ruh-backend/src/app.ts`

**Step 1: Write the failing tests**

Add tests for:
- `GET /api/agents/:id/customer-config` returning a normalized runtime config snapshot for a customer-owned agent
- `PATCH /api/agents/:id/customer-config` updating only `name`, `description`, `agentRules`, and runtime input `value`s
- rejection of unknown fields

**Step 2: Run tests to verify they fail**

Run:
```bash
cd ruh-backend
JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/customerAgentConfigApp.test.ts tests/unit/customerAgentLaunchApp.test.ts
```

Expected:
- route-not-found or assertion failures for the new customer-config contract

**Step 3: Write the minimal backend implementation**

Implement the new route handlers and any small helpers needed to normalize the payload and patch only allowed fields.

**Step 4: Run tests to verify they pass**

Run the same command and confirm green.

### Task 2: Add Validation And Runtime Config Normalization

**Files:**
- Modify: `ruh-backend/src/validation.ts`
- Modify: `ruh-backend/src/app.ts`
- Reference: `ruh-backend/src/agentStore.ts`

**Step 1: Write the failing validation-focused test**

Add a test proving unknown fields are rejected and runtime input metadata is preserved when only values are updated.

**Step 2: Run test to verify it fails**

Run:
```bash
cd ruh-backend
JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/customerAgentConfigApp.test.ts -t "rejects unknown fields|preserves runtime input metadata"
```

**Step 3: Write minimal implementation**

Add a small `validateCustomerAgentConfigPatchBody()` helper or equivalent and a normalization helper in `app.ts` for the read response.

**Step 4: Run tests to verify they pass**

Run the same targeted command and confirm green.

### Task 3: Add Flutter Service And Model Coverage First

**Files:**
- Create: `ruh_app/lib/models/customer_agent_config.dart`
- Modify: `ruh_app/lib/services/agent_service.dart`
- Create: `ruh_app/test/services/customer_agent_config_service_test.dart`

**Step 1: Write the failing test**

Add service/model tests proving:
- the config snapshot parses correctly
- the save call hits `/api/agents/:id/customer-config`
- runtime input values serialize in the patch shape expected by the backend

**Step 2: Run test to verify it fails**

Run:
```bash
cd ruh_app
flutter test test/services/customer_agent_config_service_test.dart
```

**Step 3: Write minimal implementation**

Add the DTO and service methods needed to load/save customer config.

**Step 4: Run test to verify it passes**

Run the same command and confirm green.

### Task 4: Make Installed-Agent Open Flow Chat-First

**Files:**
- Modify: `ruh_app/lib/screens/agents/agent_list_screen.dart`
- Modify: `ruh_app/lib/config/routes.dart`
- Modify: `ruh_app/test/screens/agent_list_screen_test.dart`
- Create or modify: `ruh_app/test/config/routes_test.dart`

**Step 1: Write the failing widget/route tests**

Add tests for:
- the installed-agent CTA leading into chat instead of the old detail route
- `/agents/:agentId` compatibility opening the runtime surface with config selected

**Step 2: Run tests to verify they fail**

Run:
```bash
cd ruh_app
flutter test test/screens/agent_list_screen_test.dart test/config/routes_test.dart
```

**Step 3: Write minimal implementation**

Change the CTA navigation and route compatibility wiring.

**Step 4: Run tests to verify they pass**

Run the same command and confirm green.

### Task 5: Add The Agent Config Workspace Tab

**Files:**
- Modify: `ruh_app/lib/screens/chat/widgets/computer_view.dart`
- Modify: `ruh_app/lib/screens/chat/chat_screen.dart`
- Create: `ruh_app/lib/screens/chat/widgets/agent_config_panel.dart`
- Create: `ruh_app/test/widgets/agent_config_panel_test.dart`

**Step 1: Write the failing widget tests**

Add tests for:
- `ComputerView` rendering `Agent Config`
- initial workspace tab selection
- config panel loading, showing read-only sections, and exposing editable fields

**Step 2: Run tests to verify they fail**

Run:
```bash
cd ruh_app
flutter test test/widgets/agent_config_panel_test.dart
```

**Step 3: Write minimal implementation**

Add the panel, wire it into `ComputerView`, and thread the initial-tab selection from `ChatScreen`.

**Step 4: Run tests to verify they pass**

Run the same command and confirm green.

### Task 6: Wire Save Flow And Finish Verification

**Files:**
- Modify: `ruh_app/lib/screens/chat/widgets/agent_config_panel.dart`
- Modify: `ruh_app/lib/services/agent_service.dart`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/knowledge-base/004-api-reference.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/journal/2026-04-02.md`
- Modify: `TODOS.md`

**Step 1: Write the failing save-flow tests**

Add tests for:
- successful save feedback
- section-scoped error rendering
- refresh preserving saved values

**Step 2: Run tests to verify they fail**

Run:
```bash
cd ruh_app
flutter test test/widgets/agent_config_panel_test.dart test/services/customer_agent_config_service_test.dart
```

**Step 3: Write minimal implementation**

Wire the save actions to the backend config contract and workspace-memory route, then update the docs and work log.

**Step 4: Run the final targeted verification**

Run:
```bash
cd ruh-backend
JWT_ACCESS_SECRET=test-access-secret JWT_REFRESH_SECRET=test-refresh-secret NODE_ENV=test bun test tests/unit/customerAgentConfigApp.test.ts tests/unit/customerAgentLaunchApp.test.ts

cd /Users/prasanjitdey/Documents/workspace/work/projects/openclaw-ruh-enterprise/ruh_app
flutter test test/screens/agent_list_screen_test.dart test/services/customer_agent_config_service_test.dart test/widgets/agent_config_panel_test.dart
flutter analyze lib/config/routes.dart lib/screens/agents/agent_list_screen.dart lib/screens/chat/chat_screen.dart lib/screens/chat/widgets/computer_view.dart lib/screens/chat/widgets/agent_config_panel.dart lib/services/agent_service.dart lib/models/customer_agent_config.dart
```

**Step 5: Update docs and handoff**

Document the final contract, append the journal entry, and mark the TODO complete when verification is green.
