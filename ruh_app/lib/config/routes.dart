import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../config/responsive.dart';
import '../config/theme.dart';
import '../models/auth_session.dart';
import '../providers/auth_provider.dart';
import '../screens/agents/agent_detail_screen.dart';
import '../screens/agents/agent_list_screen.dart';
import '../screens/auth/auth_loading_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/marketplace/marketplace_detail_screen.dart';
import '../screens/marketplace/marketplace_screen.dart';
import '../screens/settings/settings_screen.dart';

/// App-wide GoRouter configuration.
///
/// Routes:
///   /login               -> LoginScreen
///   /                    -> AgentListScreen (main dashboard)
///   /chat/:agentId       -> ChatScreen (tabbed chat interface)
///   /marketplace         -> MarketplaceScreen
///   /settings            -> SettingsScreen
final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _RouterRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      return resolveAuthRedirect(
        authState: authState,
        currentLocation: state.uri.toString(),
      );
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const LoginScreen(),
          transitionsBuilder: _fadeTransition,
        ),
      ),
      GoRoute(
        path: '/auth/loading',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const AuthLoadingScreen(),
          transitionsBuilder: _fadeTransition,
        ),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return AppShell(currentPath: state.uri.toString(), child: child);
        },
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) => CustomTransitionPage(
              key: state.pageKey,
              child: const AgentListScreen(),
              transitionsBuilder: _fadeTransition,
            ),
          ),
          GoRoute(
            path: '/agents/:agentId',
            pageBuilder: (context, state) {
              final agentId = state.pathParameters['agentId']!;
              return CustomTransitionPage(
                key: state.pageKey,
                child: AgentDetailScreen(agentId: agentId),
                transitionsBuilder: _slideTransition,
              );
            },
          ),
          GoRoute(
            path: '/chat/:agentId',
            pageBuilder: (context, state) {
              final agentId = state.pathParameters['agentId']!;
              return CustomTransitionPage(
                key: state.pageKey,
                child: ChatScreen(agentId: agentId),
                transitionsBuilder: _slideTransition,
              );
            },
          ),
          GoRoute(
            path: '/marketplace',
            pageBuilder: (context, state) => CustomTransitionPage(
              key: state.pageKey,
              child: const MarketplaceScreen(),
              transitionsBuilder: _fadeTransition,
            ),
          ),
          GoRoute(
            path: '/marketplace/:slug',
            pageBuilder: (context, state) {
              final slug = state.pathParameters['slug']!;
              return CustomTransitionPage(
                key: state.pageKey,
                child: MarketplaceDetailScreen(slug: slug),
                transitionsBuilder: _slideTransition,
              );
            },
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (context, state) => CustomTransitionPage(
              key: state.pageKey,
              child: const SettingsScreen(),
              transitionsBuilder: _fadeTransition,
            ),
          ),
        ],
      ),
    ],
  );
});

class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    _subscription = ref.listen<AuthState>(
      authControllerProvider,
      (previous, next) => notifyListeners(),
    );
  }

  late final ProviderSubscription<AuthState> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

Widget _fadeTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  return FadeTransition(opacity: animation, child: child);
}

Widget _slideTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  return SlideTransition(
    position: Tween<Offset>(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
    child: child,
  );
}

/// Navigation destinations shared between sidebar and bottom nav.
class _NavDestination {
  final String path;
  final String label;
  final IconData icon;
  final IconData activeIcon;

  const _NavDestination({
    required this.path,
    required this.label,
    required this.icon,
    required this.activeIcon,
  });
}

const _destinations = [
  _NavDestination(
    path: '/',
    label: 'Agents',
    icon: LucideIcons.bot,
    activeIcon: LucideIcons.bot,
  ),
  _NavDestination(
    path: '/marketplace',
    label: 'Marketplace',
    icon: LucideIcons.store,
    activeIcon: LucideIcons.store,
  ),
  _NavDestination(
    path: '/settings',
    label: 'Settings',
    icon: LucideIcons.settings,
    activeIcon: LucideIcons.settings,
  ),
];

/// App shell that provides persistent navigation across all routes.
///
/// On desktop (width >= 768), renders a sidebar alongside content.
/// On mobile, renders a bottom navigation bar.
/// Chat screen hides navigation to maximize space.
class AppShell extends ConsumerWidget {
  final String currentPath;
  final Widget child;

  const AppShell({super.key, required this.currentPath, required this.child});

  bool get _isChat =>
      currentPath.startsWith('/chat/') ||
      (currentPath.startsWith('/agents/') && currentPath != '/agents');

  int get _selectedIndex {
    if (currentPath == '/') return 0;
    if (currentPath.startsWith('/marketplace')) return 1;
    if (currentPath == '/settings') return 2;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDesktop = MediaQuery.sizeOf(context).width >= Breakpoints.tablet;
    final session = ref.watch(authControllerProvider).session;

    // Chat screen gets full space — no persistent nav
    if (_isChat) return child;

    if (isDesktop) {
      return _DesktopShell(
        selectedIndex: _selectedIndex,
        session: session,
        child: child,
      );
    }

    return _MobileShell(selectedIndex: _selectedIndex, child: child);
  }
}

class _DesktopShell extends StatelessWidget {
  final int selectedIndex;
  final AuthSession? session;
  final Widget child;

  const _DesktopShell({
    required this.selectedIndex,
    required this.session,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          Container(
            width: 220,
            decoration: BoxDecoration(
              color: RuhTheme.sidebar,
              border: Border(right: BorderSide(color: theme.dividerColor)),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  // Logo
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ShaderMask(
                          shaderCallback: (bounds) =>
                              RuhTheme.brandGradient.createShader(bounds),
                          child: Text(
                            'Ruh',
                            style: theme.textTheme.headlineLarge?.copyWith(
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Customer workspace',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: RuhTheme.textTertiary,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Nav items
                  for (var i = 0; i < _destinations.length; i++)
                    _SidebarItem(
                      destination: _destinations[i],
                      isSelected: i == selectedIndex,
                      onTap: () => context.go(_destinations[i].path),
                    ),

                  const Spacer(),

                  if (session != null)
                    Container(
                      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
                        border: Border.all(color: RuhTheme.borderDefault),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Active organization',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: RuhTheme.textTertiary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            session!.activeOrganization?.name ?? 'Workspace',
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            session!.user.email,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: RuhTheme.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: RuhTheme.accentLight,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'Customer access',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: RuhTheme.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Version footer
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      'Ruh.ai v1.0.0',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: RuhTheme.textTertiary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Content
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _SidebarItem extends StatefulWidget {
  final _NavDestination destination;
  final bool isSelected;
  final VoidCallback onTap;

  const _SidebarItem({
    required this.destination,
    required this.isSelected,
    required this.onTap,
  });

  @override
  State<_SidebarItem> createState() => _SidebarItemState();
}

class _SidebarItemState extends State<_SidebarItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: widget.isSelected
                ? RuhTheme.accentLight
                : _hovered
                ? RuhTheme.lightPurple
                : Colors.transparent,
            borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
            border: Border.all(
              color: widget.isSelected
                  ? RuhTheme.primary.withValues(alpha: 0.2)
                  : Colors.transparent,
            ),
          ),
          child: Row(
            children: [
              Icon(
                widget.isSelected
                    ? widget.destination.activeIcon
                    : widget.destination.icon,
                size: IconSizes.lg,
                color: widget.isSelected
                    ? RuhTheme.primary
                    : RuhTheme.textSecondary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.destination.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: widget.isSelected
                        ? FontWeight.w600
                        : FontWeight.normal,
                    color: widget.isSelected
                        ? RuhTheme.primary
                        : RuhTheme.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MobileShell extends StatelessWidget {
  final int selectedIndex;
  final Widget child;

  const _MobileShell({required this.selectedIndex, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) {
          context.go(_destinations[index].path);
        },
        destinations: _destinations
            .map(
              (d) => NavigationDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.activeIcon),
                label: d.label,
              ),
            )
            .toList(),
      ),
    );
  }
}
