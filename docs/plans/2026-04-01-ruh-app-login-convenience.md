# Ruh App Login Convenience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a show/hide password control and a safe remembered-email flow to the Flutter login screen without storing raw passwords.

**Architecture:** Introduce a tiny login-preferences service backed by `SharedPreferences`, expose it through a Riverpod provider, and let the login screen preload/persist remembered email while the existing auth controller continues to own session state.

**Tech Stack:** Flutter, Dart, Riverpod, shared_preferences, flutter_test

---

### Task 1: Add the login-preferences storage seam

**Files:**
- Create: `ruh_app/lib/services/login_preferences_service.dart`
- Test: `ruh_app/test/services/login_preferences_service_test.dart`

**Step 1: Write the failing test**

- Assert remembered-email preferences load correctly from mock `SharedPreferences`
- Assert saving with remember enabled stores the email
- Assert saving with remember disabled clears the stored email

**Step 2: Run test to verify it fails**

Run: `cd ruh_app && flutter test test/services/login_preferences_service_test.dart`

**Step 3: Write minimal implementation**

- Add a value object for login preferences
- Add a service interface plus shared-preferences implementation

**Step 4: Run test to verify it passes**

Run: `cd ruh_app && flutter test test/services/login_preferences_service_test.dart`

### Task 2: Wire the login screen to the new preferences

**Files:**
- Modify: `ruh_app/lib/providers/auth_provider.dart`
- Modify: `ruh_app/lib/screens/auth/login_screen.dart`
- Test: `ruh_app/test/screens/login_screen_test.dart`

**Step 1: Write/extend the failing widget tests**

- Add coverage for password visibility toggle
- Add coverage for prefilled remembered email
- Add coverage for saving remembered email after successful login

**Step 2: Run tests to verify they fail**

Run: `cd ruh_app && flutter test test/screens/login_screen_test.dart`

**Step 3: Write minimal implementation**

- Add a provider for the login-preferences service
- Load remembered email in `LoginScreen.initState`
- Add show/hide password UI
- Add `Remember me` checkbox
- Persist or clear remembered email after successful login

**Step 4: Run tests to verify they pass**

Run: `cd ruh_app && flutter test test/screens/login_screen_test.dart`

### Task 3: Update repo docs and verify

**Files:**
- Modify: `docs/knowledge-base/specs/SPEC-ruh-app-login-convenience.md`
- Modify: `docs/knowledge-base/000-INDEX.md`
- Modify: `docs/knowledge-base/018-ruh-app.md`
- Modify: `docs/knowledge-base/014-auth-system.md`
- Modify: `docs/journal/2026-04-01.md`
- Modify: `TODOS.md`

**Step 1: Update KB/docs**

- Add the new spec and index entry
- Document that native `Remember me` stores email only, not the password

**Step 2: Run targeted verification**

Run:
- `cd ruh_app && flutter test test/services/login_preferences_service_test.dart test/screens/login_screen_test.dart test/providers/auth_provider_test.dart`
- `cd ruh_app && flutter analyze`

**Step 3: Hot restart the running app**

- restart the attached Flutter macOS run session so the UI is ready to test

