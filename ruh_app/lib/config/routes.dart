import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/agents/agent_list_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/marketplace/marketplace_screen.dart';
import '../screens/settings/settings_screen.dart';

/// App-wide GoRouter configuration.
///
/// Routes:
///   /                    → AgentListScreen (main dashboard)
///   /chat/:agentId       → ChatScreen (tabbed chat interface)
///   /marketplace         → MarketplaceScreen
///   /settings            → SettingsScreen
final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) {
        return AppShell(child: child);
      },
      routes: [
        GoRoute(
          path: '/',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: AgentListScreen(),
          ),
        ),
        GoRoute(
          path: '/chat/:agentId',
          pageBuilder: (context, state) {
            final agentId = state.pathParameters['agentId']!;
            return NoTransitionPage(
              child: ChatScreen(agentId: agentId),
            );
          },
        ),
        GoRoute(
          path: '/marketplace',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: MarketplaceScreen(),
          ),
        ),
        GoRoute(
          path: '/settings',
          pageBuilder: (context, state) => const NoTransitionPage(
            child: SettingsScreen(),
          ),
        ),
      ],
    ),
  ],
);

/// App shell that wraps all routes.
///
/// On desktop (width > 800), renders a persistent sidebar alongside content.
/// On mobile, the sidebar is accessible via a drawer in [AgentListScreen].
class AppShell extends StatelessWidget {
  final Widget child;

  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    // The shell simply passes the child through.
    // Navigation logic lives in AgentListScreen.
    return child;
  }
}
