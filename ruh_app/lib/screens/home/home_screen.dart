import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/theme.dart';
import '../../models/sandbox.dart';
import '../../providers/sandbox_provider.dart';
import '../../widgets/sandbox_sidebar.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _mobileTabIndex = 0;

  void _selectSandbox(SandboxRecord sandbox) {
    context.go('/chat/${sandbox.sandboxId}');
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.sizeOf(context).width > 800;
    if (isDesktop) {
      return _buildDesktopLayout();
    }
    return _buildMobileLayout();
  }

  Widget _buildDesktopLayout() {
    final sandboxAsync = ref.watch(sandboxListProvider);

    return Scaffold(
      body: Row(
        children: [
          sandboxAsync.when(
            data: (sandboxes) => SandboxSidebar(
              sandboxes: sandboxes,
              selectedSandboxId: null,
              onSelect: _selectSandbox,
              onCreateNew: () {},
              onDelete: (sandbox) async {
                await ref.read(sandboxListProvider.notifier).deleteSandbox(sandbox.sandboxId);
              },
            ),
            loading: () => Container(
              width: 260,
              decoration: BoxDecoration(
                color: RuhTheme.sidebar,
                border: Border(right: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: const Center(child: CircularProgressIndicator()),
            ),
            error: (err, _) => Container(
              width: 260,
              decoration: BoxDecoration(
                color: RuhTheme.sidebar,
                border: Border(right: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.wifiOff, color: RuhTheme.textTertiary, size: 32),
                      const SizedBox(height: 12),
                      Text(
                        'Could not connect to backend',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: RuhTheme.textSecondary, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        onPressed: () => ref.read(sandboxListProvider.notifier).refresh(),
                        icon: const Icon(LucideIcons.refreshCw, size: 14),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Expanded(child: _buildEmptyState()),
        ],
      ),
    );
  }

  Widget _buildMobileLayout() {
    final sandboxAsync = ref.watch(sandboxListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Ruh',
          style: Theme.of(context).textTheme.headlineLarge?.copyWith(
            color: RuhTheme.primary,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.settings, size: 20),
            onPressed: () => context.go('/settings'),
            tooltip: 'Settings',
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: sandboxAsync.when(
            data: (sandboxes) => SandboxSidebar(
              sandboxes: sandboxes,
              selectedSandboxId: null,
              onSelect: (sandbox) {
                Navigator.of(context).pop();
                _selectSandbox(sandbox);
              },
              onCreateNew: () => Navigator.of(context).pop(),
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => Center(
              child: TextButton.icon(
                onPressed: () => ref.read(sandboxListProvider.notifier).refresh(),
                icon: const Icon(LucideIcons.refreshCw, size: 14),
                label: const Text('Retry connection'),
              ),
            ),
          ),
        ),
      ),
      body: _buildEmptyState(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _mobileTabIndex,
        onDestinationSelected: (index) {
          setState(() => _mobileTabIndex = index);
          switch (index) {
            case 1:
              context.go('/marketplace');
              break;
            case 2:
              context.go('/settings');
              break;
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(LucideIcons.messageSquare),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(LucideIcons.store),
            label: 'Marketplace',
          ),
          NavigationDestination(
            icon: Icon(LucideIcons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: RuhTheme.brandGradient,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: RuhTheme.primary.withValues(alpha: 0.2),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Center(
                child: Icon(LucideIcons.messageSquare, color: Colors.white, size: 32),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Select an agent to start chatting',
              style: theme.textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Choose an agent from the sidebar, or create a new one.',
              style: theme.textTheme.bodyMedium?.copyWith(color: RuhTheme.textSecondary),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
