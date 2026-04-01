# Flutter Client App (ruh_app)

[[000-INDEX|← Index]] | [[001-architecture]] | [[009-ruh-frontend|ruh-frontend →]]

---

## Overview

`ruh_app/` is a cross-platform Flutter client application that lets end users interact with their deployed Ruh.ai agents. It targets iOS, Android, macOS, and desktop from a single Dart codebase. The app communicates with `ruh-backend` over REST and SSE — the same API surface consumed by [[009-ruh-frontend]] and [[008-agent-builder-ui]]. Under [[SPEC-app-access-and-org-marketplace]], it now mirrors the same fail-closed `appAccess.customer` session contract that ships in [[009-ruh-frontend]]. As of 2026-04-01, the marketplace route is no longer a design-only prototype: it now loads real agent listings from `/api/marketplace/listings`, supports a real `/marketplace/:slug` detail route, derives install state from `/api/marketplace/my/installs`, and calls the live install endpoint instead of rendering mock workflows/MCPs. A same-day follow-up first bridged the root customer workspace to `/api/marketplace/my/installed-listings`; the current slice makes that inventory truthful by attaching a real installed runtime `agentId` to each row and launching its sandbox on demand through `POST /api/agents/:id/launch`. The native login route also now follows [[SPEC-ruh-app-login-convenience]] by adding password visibility plus opt-in remembered email without storing the raw password. The current customer-facing shell and core screens were then reshaped under [[SPEC-ruh-app-customer-surface-redesign]] so the app surfaces active-org context, clearer workspace hierarchy, more trustworthy marketplace language, and action-first runtime detail pages instead of feeling like an internal prototype. The remaining store-parity work is checkout, org entitlements, seat assignment, and richer admin-controlled assignment/use states tracked in [[SPEC-marketplace-store-parity]].

**Stack:** Flutter 3.x, Dart 3.11+, Riverpod 2.x, GoRouter 14.x, Dio 5.x, Material 3.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│  RuhApp (MaterialApp.router)                     │
│                                                  │
│  ┌────────────┐   ┌───────────────────────────┐  │
│  │  AppShell   │   │ GoRouter                  │  │
│  │  (sidebar / │   │  /login        Login      │  │
│  │  bottom nav)│   │  /auth/loading Bootstrap  │  │
│  │            │   │  /             AgentList   │  │
│  │            │   │  /agents/:id   AgentDetail │  │
│  │            │   │  /chat/:id     ChatScreen  │  │
│  │            │   │  /marketplace  Marketplace │  │
│  │            │   │  /marketplace/:slug Detail │  │
│  │            │   │  /settings     Settings    │  │
│  └────────────┘   └───────────────────────────┘  │
│                                                  │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │  Providers   │  │  Services                  │ │
│  │  (Riverpod)  │  │  ApiClient (Dio singleton) │ │
│  │  auth_       │  │  AuthService               │ │
│  │  agent_      │  │  ChatService (SSE stream)  │ │
│  │  chat_       │  │  ConversationService       │ │
│  │  marketplace_│  │  MarketplaceService        │ │
│  │  sandbox_    │  │  SandboxService             │ │
│  │  theme_      │  │  AgentService               │ │
│  │  settings_   │  │  WorkspaceService            │ │
│  │  health_     │  │  ForgeService                │ │
│  └─────────────┘  └────────────────────────────┘ │
│                                                  │
│  ┌─────────┐   ┌──────────────┐                  │
│  │ Models   │   │ Data Layer   │                  │
│  │ agent    │   │ ConversationCache (offline)     │
│  │ sandbox  │   │ (shared_preferences JSON)       │
│  │ convo    │   └──────────────┘                  │
│  └─────────┘                                     │
└──────────────────────────────────────────────────┘
         │
         ▼  REST / SSE
   ruh-backend :8000
```

---

## Navigation (GoRouter + AppShell)

Routing is defined in `lib/config/routes.dart`. Public auth routes sit outside the shell, and authenticated customer routes live under a `ShellRoute` that wraps pages in `AppShell`.

### Auth Entry And Guard

- `/login` renders the native email/password form in `lib/screens/auth/login_screen.dart`
  - includes a password show/hide control
  - includes a `Remember me` checkbox that stores only the email on-device
- `/auth/loading` is the transient bootstrap route while the app restores a stored bearer token through `GET /api/auth/me`
- `resolveAuthRedirect()` is the pure fail-closed redirect helper used by GoRouter:
  - bootstrapping sessions are sent to `/auth/loading`
  - unauthenticated or wrong-surface sessions are sent to `/login?redirect_url=...`
  - authenticated customer sessions are redirected away from `/login`

The router refreshes from `authControllerProvider`, so login, logout, and session-restore state changes immediately re-evaluate navigation without widget-level redirect logic.

### Authenticated Shell

The authenticated `ShellRoute` provides:

- **Desktop (>= 768px):** Persistent 220px sidebar with brand logo, nav items (Agents, Marketplace, Settings), active customer-organization context, signed-in user identity, and compact workspace/status framing.
- **Mobile (< 768px):** Material 3 `NavigationBar` at the bottom.
- **Chat/Agent Detail:** Navigation chrome is hidden entirely so the chat interface fills the screen.

| Route | Screen | Transition |
|---|---|---|
| `/login` | `LoginScreen` | Fade |
| `/auth/loading` | `AuthLoadingScreen` | Fade |
| `/` | `AgentListScreen` (installed marketplace workspace inventory) | Fade |
| `/agents/:agentId` | `AgentDetailScreen` | Slide |
| `/chat/:agentId` | `ChatScreen` | Slide |
| `/marketplace` | `MarketplaceScreen` | Fade |
| `/marketplace/:slug` | `MarketplaceDetailScreen` | Slide |
| `/settings` | `SettingsScreen` | Fade |

Breakpoints are centralized in `lib/config/responsive.dart`: phone 480, tablet 768, desktop 1024, wide 1200.

---

## Chat Screen (Manus-Style 2-Column Layout)

`lib/screens/chat/chat_screen.dart` implements a split-pane interface inspired by Manus:

### Desktop (> 900px)
- **Left panel (flex 2):** Chat messages (reversed `ListView`), error banner, thinking indicator, `TaskProgressFooter`, and `ChatInput`.
- **Right panel (flex 3):** `ComputerView` — the "Agent's Computer" showing live tool activity.

### Mobile (<= 900px)
- Full-width chat panel.
- FAB opens `ComputerView` as a draggable bottom sheet (30%–95% height).

### Secondary Navigation
A hamburger menu opens a bottom sheet with two tabs: **All Chats** and **Mission Control** (accessed from `tabs/tab_all_chats.dart` and `tabs/tab_mission_control.dart`).

---

## Agent's Computer (ComputerView)

`lib/screens/chat/widgets/computer_view.dart` renders the right-side workspace panel with:

### Tabs
| Tab | Widget | Purpose |
|---|---|---|
| Terminal | `TerminalPanel` | Shows live command execution output |
| Code | `CodePanel` | Displays files the agent reads/writes |
| Browser | `BrowserPanel` | Shows browser navigation and screenshots |

### Auto-Switching
Tool names from the agent's SSE stream are mapped to tabs via `_toolTabMapping`:
- `bash`, `exec`, `shell` → Terminal
- `file_write`, `file_read`, `code_editor` → Code
- `browser_navigate`, `web_search` → Browser

Auto-switch is debounced by 500ms. A manual tab click overrides auto-switch for 5 seconds.

### Header
- Live status dot (pulsing green when agent is streaming)
- Progress dots: green = done, pulsing purple = active, gray = pending
- Task counter ("Task 3 of 7")

---

## State Management (Riverpod)

All state lives in Riverpod providers under `lib/providers/`:

| Provider File | Key Providers | Pattern |
|---|---|---|
| `auth_provider.dart` | `authServiceProvider`, `authControllerProvider` | `NotifierProvider` |
| `agent_provider.dart` | `selectedAgentProvider`, `agentByIdProvider`, `activeSandboxIdProvider` | StateProvider / FutureProvider |
| `chat_provider.dart` | `chatProvider(sandboxId)` | AsyncNotifier (family) |
| `marketplace_provider.dart` | listing/detail/install-state providers | FutureProvider |
| `conversation_list_provider.dart` | Conversation list per sandbox | AsyncNotifier |
| `sandbox_provider.dart` | Sandbox list + detail | AsyncNotifier |
| `theme_provider.dart` | `themeModeProvider` | AsyncNotifier |
| `settings_provider.dart` | App settings | AsyncNotifier |
| `sandbox_health_provider.dart` | Sandbox health polling | AsyncNotifier |

### Auth State

`AuthController` in `auth_provider.dart` owns the native session lifecycle:

- schedules one startup bootstrap pass from secure storage
- calls `GET /api/auth/me` when a bearer token exists
- stores the authenticated `AuthSession` when `appAccess.customer` is true
- auto-switches during login when the initial auth response belongs to a developer org but includes an eligible customer membership
- clears the local token and fails closed when the account lacks customer access
- exposes `login()`, `logout()`, and `switchOrganization()` methods used by the login screen and settings screen

`AuthState` is explicit instead of `AsyncValue` so the router can reason about four stable states:

- `bootstrapping`
- `submitting`
- `authenticated`
- `unauthenticated`

### ChatState Model
`ChatState` in `chat_provider.dart` holds:
- `messages` — list of `ChatMessage` (role, content, tool calls, steps, streaming flag)
- `isStreaming` — whether the agent is currently responding
- `error` — latest error string
- `currentTaskPlan` — parsed Manus-style `TaskPlan` from markdown checkboxes
- `activeToolName` — drives ComputerView auto-switching
- `terminalCommands` — accumulated terminal output
- `browserState` — current browser tab state

---

## Services Layer

`lib/services/` contains the HTTP and business logic layer:

| Service | Purpose |
|---|---|
| `api_client.dart` | Dio singleton with auth interceptor, bearer-token persistence via `FlutterSecureStorage`, and SSE streaming support |
| `auth_service.dart` | Native login, `/api/auth/me` session restore, logout, and customer-access enforcement |
| `login_preferences_service.dart` | Remembered-email preference storage for the native login form |
| `chat_service.dart` | SSE-based chat streaming to `POST /api/sandboxes/:id/chat/ws` |
| `conversation_service.dart` | CRUD for conversations via `/api/sandboxes/:id/conversations` |
| `marketplace_service.dart` | Marketplace list/detail/install reads plus installed-runtime inventory reads via `/api/marketplace/*` |
| `sandbox_service.dart` | Sandbox list, detail, health via `/api/sandboxes` |
| `agent_service.dart` | Customer/runtime agent reads plus first-open launch via `/api/agents` and `POST /api/agents/:id/launch` |
| `workspace_service.dart` | Sandbox workspace files via `/api/sandboxes/:id/workspace` |
| `forge_service.dart` | Forge sandbox creation and promotion |
| `health_monitor.dart` | Periodic sandbox health polling |
| `notification_service.dart` | Local push notifications via `flutter_local_notifications` |
| `logger.dart` | Structured logging utility |

### Native Auth Contract

`ruh_app` uses the backend auth contract in [[014-auth-system]]:

- `POST /api/auth/login`
  - expects `email` + `password`
  - returns the tenant-aware auth payload including `accessToken`, `memberships`, `activeOrganization`, `activeMembership`, and `appAccess`
- `GET /api/auth/me`
  - runs during bootstrap using the stored bearer token
  - restores the active customer session when `appAccess.customer = true`
- `POST /api/auth/logout`
  - best-effort server logout plus guaranteed local token removal

Unlike the web surfaces, the native app relies on the bearer-token path instead of cookies, so `ApiClient` now exposes token read/write helpers and `BackendAuthService` is responsible for storing the returned access token after login.

The native login convenience behavior is intentionally narrower than full credential persistence:

- access tokens remain the only credential-like value persisted for session restore
- the optional `Remember me` flow stores only the email through shared preferences
- the raw password is never stored on-device

Because `POST /api/auth/switch-org` is session-based, the native app currently supports explicit customer-org switching only while the in-memory `AuthSession` still carries its refresh token from a fresh login. The Settings screen disables that action after a bootstrap-only restore where no refresh token was persisted locally.

### API Configuration
`lib/config/api_config.dart` sets:
- `baseUrl` = `http://localhost:8000` (overridable at runtime)
- `chatTimeout` = 600s (SSE streams)
- `restTimeout` = 30s (normal REST)

---

## Theme (RuhTheme)

`lib/config/theme.dart` implements the Ruh.ai brand system with Material 3:

- **Colors:** Primary purple `#AE00D0`, secondary `#7B5AFF`, tertiary `#12195E`, full light and dark palette.
- **Typography:** Sora (headings), Jost (titles/accent), Inter (body/labels) via `google_fonts`.
- **Dark mode:** Full dark surface/text/border overrides. Controlled by `themeModeProvider`.
- **Brand gradient:** `LinearGradient` from primary to secondary, used for logo and accent elements.

---

## Alive Animations

`lib/widgets/alive_animations.dart` implements the "Alive Additions" from `DESIGN.md`:

- **SoulPulse** — Breathing glow around agent avatars. `intensity` (0.0–1.0) controls glow strength.
- **Thinking indicator** — Pulsing dots in the chat when the agent is processing.
- **Live status dot** — Green pulsing dot in ComputerView header during streaming.
- **Progress dots** — Step-by-step progress with color-coded animated states.

---

## Data Layer

| File | Purpose |
|---|---|
| `lib/data/database.dart` | Barrel export for data layer |
| `lib/data/conversation_cache.dart` | Offline conversation cache using `shared_preferences` (JSON serialization) |

Drift/SQLite dependencies are in `pubspec.yaml` for potential future use (full-text search over messages) but not currently exercised.

---

## Models

| File | Type | Fields |
|---|---|---|
| `lib/models/agent.dart` | `Agent` | id, name, avatar, sandboxIds, description, status |
| `lib/models/marketplace_listing.dart` | `MarketplaceListing`, `InstalledMarketplaceListing` | live marketplace list/detail DTOs plus installed-workspace inventory rows backed by `/api/marketplace/listings*` and `/api/marketplace/my/installed-listings`, including the installed runtime `agentId` |
| `lib/models/auth_session.dart` | `AuthSession` | user, accessToken, memberships, activeOrganization, activeMembership, appAccess |
| `lib/models/sandbox.dart` | `Sandbox` | id, status, gateway info, container metadata |
| `lib/models/conversation.dart` | `Conversation` | id, sandboxId, title, messages, sessionKey |

---

## Backend APIs Consumed

The Flutter app talks to [[004-api-reference]] endpoints on `ruh-backend`:

| Feature | Endpoint Pattern |
|---|---|
| Auth login/session | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Customer runtime agent list/detail/launch | `GET /api/agents`, `GET /api/agents/:id`, `POST /api/agents/:id/launch` |
| Sandbox list/health | `GET /api/sandboxes`, `GET /api/sandboxes/:id/health` |
| Chat (SSE streaming) | `POST /api/sandboxes/:id/chat/ws` |
| Conversations CRUD | `GET/POST /api/sandboxes/:id/conversations`, `GET /api/sandboxes/:id/conversations/:cid/messages` |
| Workspace files | `GET /api/sandboxes/:id/workspace` |
| Forge creation | `POST /api/sandboxes/create` + SSE via `GET /api/sandboxes/stream/:stream_id` |
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/refresh` |
| Marketplace | `GET /api/marketplace/*`, including `/api/marketplace/my/installed-listings` for the customer workspace inventory and runtime handoff |

## Testing

The Flutter package now has a real auth-focused test harness under `ruh_app/test/`:

- `test/services/auth_service_test.dart`
  - access-token storage on login
  - `/api/auth/me` restore semantics
  - stale-token clearing on 401
  - logout clearing local state
- `test/providers/auth_provider_test.dart`
  - customer session bootstrap
  - wrong-surface fail-closed behavior
  - login failure messaging
  - logout transitions
- `test/config/routes_test.dart`
  - redirect matrix for bootstrapping, unauthenticated, and authenticated customer sessions
- `test/screens/login_screen_test.dart`
  - form submission
  - inline auth errors
  - password visibility toggle
  - remembered-email preload/save behavior
- `test/services/login_preferences_service_test.dart`
  - remembered email loads only when opt-in is enabled
  - remembered email clears when the preference is disabled
- `test/services/marketplace_service_test.dart`
  - marketplace list/detail reads
  - install endpoint
  - installed-workspace inventory parsing
- `test/config/marketplace_routes_test.dart`
  - customer-facing marketplace hero copy and detail labels
- `test/screens/agent_list_screen_test.dart`
  - installed-workspace card rendering
  - workspace header and summary rendering
  - marketplace-first empty state
- `test/config/routes_test.dart`
  - authenticated shell rendering with active-org and signed-in-user context
- `test/widget_test.dart`
  - app bootstrap renders the guarded login flow without crashing
- `integration_test/login_flow_test.dart`
  - boots the real macOS desktop app against the live backend
  - clears any persisted native token before launch
  - signs in with the seeded customer-admin fixture
  - proves the app leaves `/login` and reaches the authenticated shell

Validation commands:

```bash
cd ruh_app
flutter test
flutter test integration_test/login_flow_test.dart -d macos
flutter analyze
```

---

## Key Files

| File | Purpose |
|---|---|
| `lib/main.dart` | App entry point, `ProviderScope`, error boundary, Riverpod logger |
| `lib/config/routes.dart` | GoRouter config + AppShell (sidebar/bottom nav) |
| `lib/providers/auth_provider.dart` | Native session controller, auth state, and redirect helper |
| `lib/screens/auth/login_screen.dart` | Local customer login form |
| `lib/services/login_preferences_service.dart` | Remembered-email preference storage for native login |
| `lib/screens/auth/auth_loading_screen.dart` | Bootstrap loading route |
| `lib/services/access_token_store.dart` | Secure-token storage with macOS fallback for local desktop builds |
| `lib/config/theme.dart` | RuhTheme — full Material 3 light/dark theme |
| `lib/config/api_config.dart` | Backend URL, timeouts |
| `lib/config/responsive.dart` | Breakpoint constants |
| `lib/screens/settings/settings_screen.dart` | Account-first settings surface with org switcher and advanced local-dev controls |
| `lib/screens/agents/agent_detail_screen.dart` | Customer runtime detail screen with launch/open-chat-first hierarchy |
| `lib/screens/chat/chat_screen.dart` | Manus-style split-pane chat |
| `lib/screens/chat/widgets/computer_view.dart` | Agent's Computer with Terminal/Code/Browser tabs |
| `lib/screens/chat/widgets/chat_input.dart` | Message input with model selector |
| `lib/screens/chat/widgets/message_bubble.dart` | Chat message rendering |
| `lib/screens/chat/widgets/task_plan_widget.dart` | Manus-style task plan display |
| `lib/screens/agents/agent_list_screen.dart` | Installed-agents workspace home with customer-facing summary and empty/loading states |
| `lib/screens/marketplace/marketplace_screen.dart` | Employee Marketplace browser backed by the live marketplace list API |
| `lib/screens/marketplace/marketplace_detail_screen.dart` | Customer-facing marketplace detail + install/use handoff |
| `lib/widgets/alive_animations.dart` | SoulPulse and brand animations |
| `lib/services/api_client.dart` | Dio HTTP singleton with auth |
| `lib/services/auth_service.dart` | Login/bootstrap/logout service |
| `lib/services/chat_service.dart` | SSE chat streaming |

---

## Development

```bash
# Run on connected device or emulator
cd ruh_app
flutter run

# Run on macOS desktop
flutter run -d macos

# Run on Chrome (web)
flutter run -d chrome
```

Requires `ruh-backend` running on `localhost:8000`. Override `ApiConfig.baseUrl` for remote backends.

---

## Related Notes

- [[001-architecture]] — System architecture and service map
- [[004-api-reference]] — Backend API endpoints this app consumes
- [[008-agent-builder-ui]] — Web-based agent builder (shares the "Agent's Computer" UX pattern)
- [[009-ruh-frontend]] — Web-based client app (same user tier, different technology)
- [[SPEC-remove-tauri-desktop-app]] — records the retirement of the old Tauri wrapper so `ruh_app` is the only native client path
- [[016-marketplace]] — Employee Marketplace (browsed from the Flutter app)
- [[SPEC-ruh-app-customer-surface-redesign]] — customer-facing shell, workspace, marketplace, detail, and settings redesign for the Flutter app
- [[SPEC-marketplace-store-parity]] — replaces the current mock marketplace with real catalog/detail/use parity
- [[SPEC-deployed-chat-task-mode]] — Manus-style task plan spec that the Flutter chat implements
- [[SPEC-deployed-chat-browser-workspace]] — Browser tab spec consumed by BrowserPanel
