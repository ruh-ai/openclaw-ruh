# Flutter Client App (ruh_app)

[[000-INDEX|← Index]] | [[001-architecture]] | [[009-ruh-frontend|ruh-frontend →]]

---

## Overview

`ruh_app/` is a cross-platform Flutter client application that lets end users interact with their deployed Ruh.ai agents. It targets iOS, Android, macOS, and desktop from a single Dart codebase. The app communicates with `ruh-backend` over REST and SSE — the same API surface consumed by [[009-ruh-frontend]] and [[008-agent-builder-ui]]. Under [[SPEC-app-access-and-org-marketplace]], it now mirrors the same fail-closed `appAccess.customer` session contract that ships in [[009-ruh-frontend]]. As of 2026-04-01, the marketplace route is no longer a design-only prototype: it now loads real agent listings from `/api/marketplace/listings`, supports a real `/marketplace/:slug` detail route, derives install state from `/api/marketplace/my/installs`, and calls the live install endpoint instead of rendering mock workflows/MCPs. A same-day follow-up first bridged the root customer workspace to `/api/marketplace/my/installed-listings`; the current slice makes that inventory truthful by attaching a real installed runtime `agentId` to each row and launching its sandbox on demand through `POST /api/agents/:id/launch`. The native login route also now follows [[SPEC-ruh-app-login-convenience]] by adding password visibility plus opt-in remembered email without storing the raw password. The current customer-facing shell and core screens were then reshaped under [[SPEC-ruh-app-customer-surface-redesign]] so the app surfaces active-org context, clearer workspace hierarchy, more trustworthy marketplace language, and action-first runtime detail pages instead of feeling like an internal prototype. Under [[SPEC-ruh-app-chat-first-agent-config]], the installed-agent handoff is now chat-first instead of detail-first: `Open chat` launches the runtime, lands directly in `ChatScreen`, and keeps runtime tools plus a first-class `Agent Config` tab in the same workspace. The remaining store-parity work is checkout, org entitlements, seat assignment, and richer admin-controlled assignment/use states tracked in [[SPEC-marketplace-store-parity]].

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
│  │            │   │  /agents/:id   Chat (config)│  │
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
- **Chat/runtime routes:** Navigation chrome is hidden entirely so the runtime interface fills the screen for `/chat/:id` and the legacy `/agents/:id` compatibility handoff.

| Route | Screen | Transition |
|---|---|---|
| `/login` | `LoginScreen` | Fade |
| `/auth/loading` | `AuthLoadingScreen` | Fade |
| `/` | `AgentListScreen` (installed marketplace workspace inventory) | Fade |
| `/agents/:agentId` | `ChatScreen` with `Agent Config` preselected (compatibility handoff) | Slide |
| `/chat/:agentId` | `ChatScreen` | Slide |
| `/marketplace` | `MarketplaceScreen` | Fade |
| `/marketplace/:slug` | `MarketplaceDetailScreen` | Slide |
| `/settings` | `SettingsScreen` | Fade |

Breakpoints are centralized in `lib/config/responsive.dart`: phone 480, tablet 768, desktop 1024, wide 1200.

---

## Chat Screen (Manus-Style 2-Column Layout)

`lib/screens/chat/chat_screen.dart` implements a split-pane interface inspired by Manus:

Installed marketplace workspace cards now call `POST /api/agents/:id/launch` first and navigate directly into this route, so chat is the primary runtime destination instead of a separate detail screen.
The first runtime-recovery slice from [[SPEC-ruh-app-runtime-recovery]] also makes health explicit here: the chat header now reflects polled sandbox health instead of a hardcoded `Online` label, and degraded or unreachable runtimes render an in-chat recovery banner with refresh, retry, and restart actions.

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
| Files | `CodePanel` | Displays workspace files the agent reads/writes via `/api/sandboxes/:id/workspace/files` |
| Browser | `BrowserPanel` | Shows browser navigation plus raw screenshot bytes fetched from `/api/sandboxes/:id/browser/screenshot` |
| Agent Config | `AgentConfigPanel` | Reads the customer-safe runtime config snapshot and lets operators update editable runtime fields without leaving chat |

### Auto-Switching
Tool names from the agent's SSE stream are mapped to tabs via `_toolTabMapping`:
- `bash`, `exec`, `shell` → Terminal
- `file_write`, `file_read`, `code_editor` → Files
- `browser_navigate`, `web_search` → Browser

Because the current OpenClaw operator socket does not always emit live tool frames, the Flutter runtime also depends on the backend `POST /api/sandboxes/:id/chat/ws` route replaying the latest turn's `tool_start` / `tool_end` events from the session transcript when needed. That replay path is what makes the terminal/task progress view move again on the customer runtime surface. See [[LEARNING-2026-04-02-flutter-runtime-contract-repair]].

Auto-switch is debounced by 500ms. A manual tab click overrides auto-switch for 5 seconds.

### Runtime Recovery

- `sandboxHealthProvider` now polls sandbox health while the runtime surface is open instead of acting as a one-shot status fetch.
- Chat and Mission Control recovery actions reuse the same provider-backed health model:
  - refresh status
  - retry chat hydration
  - restart runtime
- Browser and Files now expose manual refresh controls directly inside their tabs, so recovery no longer requires leaving the active workspace.
- The design goal is operator trust, not silent self-healing: the client does not auto-restart sandboxes on its own.

### Agent Config Tab

`AgentConfigPanel` keeps runtime operations and runtime tuning in one place:

- Editable now:
  - agent `name`
  - `description`
  - `agentRules`
  - runtime-input `value`s
  - workspace-memory instructions, continuity summary, and pinned paths
- Read-only now:
  - skills
  - tool connections
  - triggers
  - channels
  - creation-session snapshot

The panel loads `GET /api/agents/:id/customer-config`, saves safe runtime metadata through `PATCH /api/agents/:id/customer-config`, saves workspace memory through `PATCH /api/agents/:id/workspace-memory`, and then refreshes the selected-agent state so the rest of chat reflects the updated runtime identity immediately. See [[LEARNING-2026-04-02-customer-safe-agent-config-seam]].

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
| `sandbox_health_provider.dart` | Polling sandbox health plus manual refresh and restart-runtime actions | AsyncNotifier |

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
| `api_client.dart` | Dio singleton with auth interceptor, bearer-token persistence via `FlutterSecureStorage`, SSE streaming support, and a dedicated raw-bytes path for browser screenshots |
| `auth_service.dart` | Native login, `/api/auth/me` session restore, logout, and customer-access enforcement |
| `login_preferences_service.dart` | Remembered-email preference storage for the native login form |
| `chat_service.dart` | SSE-based chat streaming to `POST /api/sandboxes/:id/chat/ws` |
| `conversation_service.dart` | CRUD for conversations via `/api/sandboxes/:id/conversations` |
| `marketplace_service.dart` | Marketplace list/detail/install reads plus installed-runtime inventory reads via `/api/marketplace/*` |
| `sandbox_service.dart` | Sandbox list, detail, health via `/api/sandboxes` plus `/api/sandboxes/:id/status` |
| `agent_service.dart` | Customer/runtime agent reads plus first-open launch via `/api/agents` and `POST /api/agents/:id/launch` |
| `workspace_service.dart` | Sandbox workspace files via `/api/sandboxes/:id/workspace/files` and `/api/sandboxes/:id/workspace/file` |
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
  - relies on backend bearer-token `orgId` fallback so native sessions keep the correct active organization even without browser cookies
- `POST /api/auth/logout`
  - best-effort server logout plus guaranteed local token removal

Unlike the web surfaces, the native app relies on the bearer-token path instead of cookies, so `ApiClient` now exposes token read/write helpers and `BackendAuthService` is responsible for storing the returned access token after login. `AccessTokenStore` also keeps access + refresh tokens cached in-process so the first authenticated request after login or refresh does not depend on a successful round-trip back through platform storage.

For runtime health, the app now treats backend `gateway_reachable` as the source of truth instead of inferring health only from a coarse status string. `SandboxHealth.fromJson()` and `HealthMonitor` both key off that explicit field so a running-but-unreachable sandbox fails closed until the backend repair path restores it.

The native login convenience behavior is intentionally narrower than full credential persistence:

- access + refresh tokens are persisted through the native token store for session continuity and silent refresh
- the token store also keeps those values in memory for the current process so temporary keychain/readback issues do not drop the active session immediately
- the optional `Remember me` flow stores only the email through shared preferences
- the raw password is never stored on-device
- For mixed developer+customer accounts, the auth payload must report `appAccess` for the active org only. `BackendAuthService.login()` depends on a developer-active response returning `customer = false` so it can auto-switch with `memberships[]` + `refreshToken`; otherwise the Flutter app can mount the customer shell while customer-only APIs still reject the developer-active session. See [[014-auth-system]] and [[LEARNING-2026-04-02-auth-app-access-session-scope]].
- Native bootstrap now also carries the stored refresh token back into `AuthSession`, so customer-org switching and silent refresh continue to work from restored sessions rather than only immediately after login. See [[LEARNING-2026-04-02-flutter-bearer-session-continuity]].

Because `POST /api/auth/switch-org` is session-based, the native app depends on the locally stored refresh token for explicit customer-org switching. That token is now restored into the native `AuthSession`, so switching no longer needs to be limited to the fresh-login window.

### Browser Debugging Caveat

- `ruh_app` is still a desktop/mobile-first Flutter project and does **not** currently include a checked-in `web/` scaffold, so browser runs are a debug-only inspection path rather than a supported shipped target.
- `flutter run -d chrome --web-port 4001` and `flutter run -d web-server --web-port 4000` can still be useful for local UI checks, but:
  - profile/release web builds fail until a real `web/` directory is added
  - backend `ALLOWED_ORIGINS` must include `http://localhost:4000`, `http://127.0.0.1:4000`, `http://localhost:4001`, and `http://127.0.0.1:4001` or the login/bootstrap calls will fail with browser transport errors
  - the debug-only `DebugOverlay` is intentionally skipped on web because wrapping the router output there triggered a `_RenderTheater` layout assertion during browser startup

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
| `lib/models/customer_agent_config.dart` | `CustomerAgentConfig`, related DTOs | customer-safe runtime config snapshot, runtime input value updates, workspace-memory payload |
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
| Customer runtime config | `GET /api/agents/:id/customer-config`, `PATCH /api/agents/:id/customer-config`, `GET/PATCH /api/agents/:id/workspace-memory` |
| Sandbox list/health | `GET /api/sandboxes`, `GET /api/sandboxes/:id/status`, `GET /api/sandboxes/:id/browser/status`, `GET /api/sandboxes/:id/browser/screenshot` |
| Chat (SSE streaming) | `POST /api/sandboxes/:id/chat/ws` |
| Conversations CRUD | `GET/POST /api/sandboxes/:id/conversations`, `GET /api/sandboxes/:id/conversations/:cid/messages` |
| Workspace files | `GET /api/sandboxes/:id/workspace/files`, `GET /api/sandboxes/:id/workspace/file` |
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
- `test/services/chat_service_test.dart`
  - `/chat/ws` route selection
  - structured tool-event parsing
- `test/services/workspace_service_test.dart`
  - `items` payload parsing for workspace files
  - preview-port proxy URL generation
- `test/services/customer_agent_config_service_test.dart`
  - customer config snapshot parsing
  - customer config patch serialization
- `test/providers/sandbox_health_provider_test.dart`
  - runtime health refresh and restart behavior
- `test/widgets/browser_panel_test.dart`
  - raw screenshot-byte fetch path for the browser panel
  - browser refresh affordance
- `test/widgets/runtime_status_banner_test.dart`
  - degraded and offline runtime banner copy plus recovery actions
- `test/widgets/code_panel_test.dart`
  - files tab refresh affordance
- `test/widgets/agent_config_panel_test.dart`
  - `ComputerView` exposes the Agent Config tab and loads the panel
- `test/config/marketplace_routes_test.dart`
  - customer-facing marketplace hero copy and detail labels
- `test/screens/agent_list_screen_test.dart`
  - installed-workspace card rendering
  - direct `Open chat` runtime launch + navigation
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
| `lib/screens/chat/chat_screen.dart` | Manus-style split-pane chat and the primary installed-agent destination |
| `lib/screens/chat/widgets/computer_view.dart` | Agent's Computer with Terminal, Files, Browser, and Agent Config tabs |
| `lib/screens/chat/widgets/runtime_status_banner.dart` | Provider-backed runtime health banner and recovery actions used inside chat |
| `lib/screens/chat/widgets/agent_config_panel.dart` | Customer-safe runtime config editor embedded beside live runtime tools |
| `lib/screens/chat/widgets/chat_input.dart` | Message input with model selector |
| `lib/screens/chat/widgets/message_bubble.dart` | Chat message rendering |
| `lib/screens/chat/widgets/task_plan_widget.dart` | Manus-style task plan display |
| `lib/screens/agents/agent_list_screen.dart` | Installed-agents workspace home with direct runtime launch into chat |
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
- [[SPEC-ruh-app-chat-first-agent-config]] — moves the primary customer runtime entry directly into chat and adds a first-class Agent Config tab beside Terminal, Files, and Browser
- [[SPEC-ruh-app-runtime-recovery]] — adds honest sandbox health, in-chat recovery actions, and tab-level refresh affordances to the customer runtime
- [[SPEC-marketplace-store-parity]] — replaces the current mock marketplace with real catalog/detail/use parity
- [[SPEC-deployed-chat-task-mode]] — Manus-style task plan spec that the Flutter chat implements
- [[SPEC-deployed-chat-browser-workspace]] — Browser tab spec consumed by BrowserPanel
- [[LEARNING-2026-04-02-customer-safe-agent-config-seam]] — why customer runtime editing uses a dedicated safe config route instead of the builder authoring patch routes
- [[LEARNING-2026-04-02-runtime-health-trust-surface]] — why runtime trust depends on polled health and explicit recovery actions rather than sandbox-id presence
