# Ruh Flutter App Architecture

Cross-platform mobile/desktop client for Ruh.ai where end users interact with deployed AI agents via a Manus-style split-pane chat interface with live agent workspace view.

## Navigation System

GoRouter shell route with persistent sidebar (desktop) or bottom nav (mobile). Chat hides nav for full-screen.

- AppShell wraps all routes, reads `currentPath` to highlight active nav item
- Page transitions: fade for tabs, slide-right for chat push
- Deep-link: `/chat/:agentId` fetches agent by ID via ruh_app/lib/providers/agent_provider.dart#agentByIdProvider
- Routes defined in ruh_app/lib/config/routes.dart

## Theme and Design

Material 3 theme with brand colors, dark mode, and "Alive" micro-animations from DESIGN.md.

- ThemeModeNotifier persists selection to SharedPreferences via ruh_app/lib/providers/theme_provider.dart
- Typography: Sora headings, Jost titles, Inter body — defined in ruh_app/lib/config/theme.dart
- Alive animations in ruh_app/lib/widgets/alive_animations.dart: SoulPulse, GradientDrift, BreathingFocus, SparkMoment, WarmthHover
- Centralized breakpoints and icon sizes in ruh_app/lib/config/responsive.dart
- Error formatting via ruh_app/lib/utils/error_formatter.dart

## Chat Screen

Manus-style two-panel layout: chat left, Agent's Computer right. Mobile collapses to single column with bottom sheet.

- Desktop (>900px): flex 2:3 split with ruh_app/lib/screens/chat/widgets/computer_view.dart
- Mobile: full-width chat, FAB opens workspace as DraggableScrollableSheet
- Messages rendered by ruh_app/lib/screens/chat/widgets/message_bubble.dart with inline TaskPlanPanel and step indicators
- Progress footer ruh_app/lib/screens/chat/widgets/task_progress_footer.dart: pulsing dot + status + step counter
- All Chats and Mission Control accessible via hamburger menu bottom sheet
- Main screen: ruh_app/lib/screens/chat/chat_screen.dart

## Computer View

Right-panel workspace showing Terminal, Code, and Browser tabs with auto-switching on tool events.

- Terminal: dark theme (#0c0a14), numbered commands, live/ready badges — ruh_app/lib/screens/chat/widgets/terminal_panel.dart
- Code: syntax-highlighted viewer with line numbers — ruh_app/lib/screens/chat/widgets/code_panel.dart
- Browser: screenshot polling (750ms), navigation history — ruh_app/lib/screens/chat/widgets/browser_panel.dart
- Auto-switch: tool events map to tabs (500ms debounce, 5s manual override)
- Progress dots in header: green=done, pulsing purple=active, gray=pending

## State Management

Riverpod AsyncNotifier pattern for all async data. No manual setState for data loading.

- ruh_app/lib/providers/chat_provider.dart: ChatNotifier parses SSE events into ChatState with messages, terminalCommands, browserState, activeToolName
- ruh_app/lib/providers/agent_provider.dart: AgentListNotifier, selectedAgentProvider, activeSandboxIdProvider, agentByIdProvider
- ruh_app/lib/providers/theme_provider.dart: ThemeModeNotifier with SharedPreferences persistence
- ruh_app/lib/providers/sandbox_health_provider.dart: FutureProvider for sandbox health checks

## Data Models

Immutable models with fromJson factories. Agent, ChatMessage, ChatStep, TaskPlan are the core types.

- ruh_app/lib/models/agent.dart: Agent with skills, sandboxIds, workspaceMemory, triggers, channels
- ruh_app/lib/models/conversation.dart: Conversation, Message, workspace state types
- ruh_app/lib/models/sandbox.dart: SandboxRecord, SandboxHealth
- ChatMessage/ChatStep/TaskPlan/TerminalCommand/BrowserWorkspaceState defined in chat_provider.dart

## Services

Dio-based HTTP services for backend communication. SSE streaming for chat.

- ruh_app/lib/services/api_client.dart: configurable base URL, timeout settings
- ruh_app/lib/services/chat_service.dart: SSE streaming with textDelta/toolStart/toolEnd/done/error events
- ruh_app/lib/services/conversation_service.dart: conversation CRUD, message history
- ruh_app/lib/services/agent_service.dart: agent CRUD, health checks, workspace memory
- ruh_app/lib/services/workspace_service.dart: file listing, file content, preview ports

## Backend APIs

REST and SSE endpoints consumed from ruh-backend running on port 8000.

- `POST /api/sandboxes/:id/chat` — SSE chat streaming
- `GET /api/sandboxes/:id/browser/screenshot` — JPEG screenshots for browser panel
- `GET /api/sandboxes/:id/workspace/files` — file tree for files panel
- `GET /api/sandboxes/:id/workspace/file` — file content for code panel
- `GET /api/sandboxes/:id/preview/ports` — dev server detection
- `GET /api/agents` / `GET /api/agents/:id` — agent CRUD

## Screens

Four main screens behind AppShell navigation. Chat hides shell for immersive workspace.

- ruh_app/lib/screens/agents/agent_list_screen.dart (`/`): responsive grid with skeleton loading, soul pulse avatars
- ruh_app/lib/screens/chat/chat_screen.dart (`/chat/:agentId`): split-pane with workspace, progress footer
- ruh_app/lib/screens/marketplace/marketplace_screen.dart (`/marketplace`): hero with gradient drift, categories, listing grid
- ruh_app/lib/screens/settings/settings_screen.dart (`/settings`): backend URL config, theme toggle, connection test

## Shared Widgets

Reusable UI components used across multiple screens.

- ruh_app/lib/widgets/skeleton_loader.dart: shimmer placeholders (AgentCardSkeleton, ConversationSkeleton)
- ruh_app/lib/widgets/gradient_button.dart: branded button with loading state
- ruh_app/lib/widgets/sandbox_sidebar.dart: agent list for sidebar navigation
- ruh_app/lib/widgets/debug_overlay.dart: floating log panel (debug mode only, deferred setState)
- ruh_app/lib/widgets/alive_animations.dart: SoulPulse, GradientDrift, SparkMoment, BreathingFocus, WarmthHover
