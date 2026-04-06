import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../models/marketplace_listing.dart';
import '../../providers/agent_provider.dart';
import '../../providers/marketplace_provider.dart';
import '../../utils/error_formatter.dart';
import '../../widgets/alive_animations.dart';
import '../../widgets/skeleton_loader.dart';

/// Customer workspace surface backed by installed marketplace listings.
///
/// This replaces the old builder-style `/api/agents` dashboard for customer
/// sessions. The full launch/use contract still lands with org entitlements,
/// but installed marketplace agents are now visible and reachable here.
class AgentListScreen extends ConsumerStatefulWidget {
  const AgentListScreen({super.key});

  @override
  ConsumerState<AgentListScreen> createState() => _AgentListScreenState();
}

class _AgentListScreenState extends ConsumerState<AgentListScreen> {
  Timer? _autoRefreshTimer;
  bool _isRefreshing = false;
  String? _openingAgentId;

  @override
  void initState() {
    super.initState();
    _autoRefreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _silentRefresh(),
    );
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _silentRefresh() async {
    if (_isRefreshing) return;
    setState(() => _isRefreshing = true);
    try {
      ref.invalidate(marketplaceInstalledListingsProvider);
      await ref.read(marketplaceInstalledListingsProvider.future);
    } catch (_) {
      // Keep silent for background refreshes.
    } finally {
      if (mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  Future<void> _onRefresh() async {
    ref.invalidate(marketplaceInstalledListingsProvider);
    await ref.read(marketplaceInstalledListingsProvider.future);
  }

  Future<void> _openInstalledAgent(InstalledMarketplaceListing item) async {
    final agentId = item.agentId;
    if (agentId.isEmpty || _openingAgentId != null) {
      return;
    }

    setState(() => _openingAgentId = agentId);
    try {
      final service = ref.read(agentServiceProvider);

      // Fetch the agent first to check for missing required inputs
      final agent = await service.getAgent(agentId);
      if (!mounted) return;

      if (agent != null && agent.hasMissingRequiredInputs) {
        // Redirect to setup screen instead of launching
        context.push('/agents/$agentId/setup', extra: agent);
        return;
      }

      // No missing inputs — launch directly
      final launchableAgent = await service.launchAgent(agentId);
      if (!mounted) return;

      ref.read(selectedAgentProvider.notifier).state = launchableAgent;
      ref.read(activeSandboxIdProvider.notifier).state =
          launchableAgent.sandboxIds.isNotEmpty
              ? launchableAgent.sandboxIds.first
              : null;
      context.push('/chat/${launchableAgent.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open agent: ${formatError(e)}')),
      );
    } finally {
      if (mounted) {
        setState(() => _openingAgentId = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final installedAsync = ref.watch(marketplaceInstalledListingsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Workspace',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Browse marketplace',
            onPressed: () => context.go('/marketplace'),
            icon: const Icon(LucideIcons.store),
          ),
          if (_isRefreshing)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: installedAsync.when(
        data: (items) => RefreshIndicator(
          onRefresh: _onRefresh,
          color: RuhTheme.primary,
          child: _WorkspaceBody(
            items: items,
            onOpenAgent: _openInstalledAgent,
            openingAgentId: _openingAgentId,
          ),
        ),
        loading: () => const _LoadingSkeleton(),
        error: (err, _) => _ErrorState(
          error: formatError(err),
          onRetry: () =>
              ref.refresh(marketplaceInstalledListingsProvider.future),
        ),
      ),
    );
  }
}

class _WorkspaceBody extends StatelessWidget {
  final List<InstalledMarketplaceListing> items;
  final Future<void> Function(InstalledMarketplaceListing item) onOpenAgent;
  final String? openingAgentId;

  const _WorkspaceBody({
    required this.items,
    required this.onOpenAgent,
    required this.openingAgentId,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: const [
          _WorkspaceHeader(
            title: 'Installed agents',
            summary: 'No agents installed',
            description:
                'Bring trusted digital employees into your workspace and launch them when your team is ready.',
          ),
          SizedBox(height: 20),
          _EmptyState(),
        ],
      );
    }

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: _WorkspaceHeader(
              title: 'Installed agents',
              summary: '${items.length} ready to open',
              description:
                  'Everything your team has already brought into this workspace, with the fastest path back into action.',
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: _WorkspaceSummaryStrip(items: items),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          sliver: _InstalledAgentGrid(
            items: items,
            onOpenAgent: onOpenAgent,
            openingAgentId: openingAgentId,
          ),
        ),
      ],
    );
  }
}

class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth >= Breakpoints.desktop
            ? 3
            : constraints.maxWidth >= Breakpoints.tablet
            ? 2
            : 1;
        return CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: _WorkspaceHeader(
                  title: 'Installed agents',
                  summary: 'Loading workspace',
                  description:
                      'Checking which digital employees are ready for your team.',
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: crossAxisCount,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: crossAxisCount == 1 ? 2.0 : 1.45,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, index) => const AgentCardSkeleton(),
                  childCount: 6,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: RuhTheme.borderDefault),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              gradient: RuhTheme.brandGradient,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: RuhTheme.primary.withValues(alpha: 0.18),
                  blurRadius: 28,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: const Center(
              child: Icon(
                LucideIcons.store,
                color: Colors.white,
                size: IconSizes.xxl,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'No installed agents yet',
            style: theme.textTheme.headlineMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Install agents from the marketplace to bring them into your workspace.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: RuhTheme.textSecondary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => context.go('/marketplace'),
            icon: const Icon(LucideIcons.arrowRight),
            label: const Text('Browse Marketplace'),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorState({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.wifiOff,
              size: 40,
              color: RuhTheme.textTertiary,
            ),
            const SizedBox(height: 16),
            Text(
              'Could not load installed agents',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              error,
              style: const TextStyle(
                color: RuhTheme.textTertiary,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(LucideIcons.refreshCw, size: IconSizes.sm),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _InstalledAgentGrid extends StatelessWidget {
  final List<InstalledMarketplaceListing> items;
  final Future<void> Function(InstalledMarketplaceListing item) onOpenAgent;
  final String? openingAgentId;

  const _InstalledAgentGrid({
    required this.items,
    required this.onOpenAgent,
    required this.openingAgentId,
  });

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.crossAxisExtent;
        final crossAxisCount = width >= Breakpoints.desktop
            ? 3
            : width >= Breakpoints.tablet
            ? 2
            : 1;

        return SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: crossAxisCount == 1 ? 1.9 : 1.45,
          ),
          delegate: SliverChildBuilderDelegate((context, index) {
            final item = items[index];
            return _InstalledAgentCard(
              item: item,
              isOpening: openingAgentId == item.agentId,
              onOpen: () => onOpenAgent(item),
            );
          }, childCount: items.length),
        );
      },
    );
  }
}

class _WorkspaceHeader extends StatelessWidget {
  final String title;
  final String summary;
  final String description;

  const _WorkspaceHeader({
    required this.title,
    required this.summary,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GradientDrift(
      borderRadius: BorderRadius.circular(32),
      colors: const [
        Color(0xFFFEF6FF),
        Color(0xFFF8F2FF),
        Color(0xFFFDF7FF),
      ],
      child: Padding(
        padding: const EdgeInsets.fromLTRB(28, 26, 28, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                summary,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: RuhTheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: theme.textTheme.displayMedium?.copyWith(
                color: RuhTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              description,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: RuhTheme.textSecondary,
                height: 1.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceSummaryStrip extends StatelessWidget {
  final List<InstalledMarketplaceListing> items;

  const _WorkspaceSummaryStrip({required this.items});

  @override
  Widget build(BuildContext context) {
    final latest = [...items]
      ..sort((a, b) => b.installedAt.compareTo(a.installedAt));
    final newest = latest.first;

    return Row(
      children: [
        Expanded(
          child: _SummaryMetric(
            label: 'Installed now',
            value: '${items.length}',
            caption: items.length == 1 ? '1 active teammate' : '${items.length} active teammates',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _SummaryMetric(
            label: 'Latest install',
            value: _formatInstalledDate(newest.installedAt),
            caption: 'Most recently added teammate',
          ),
        ),
      ],
    );
  }
}

class _SummaryMetric extends StatelessWidget {
  final String label;
  final String value;
  final String caption;

  const _SummaryMetric({
    required this.label,
    required this.value,
    required this.caption,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: RuhTheme.textTertiary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            caption,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: RuhTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _InstalledAgentCard extends StatefulWidget {
  final InstalledMarketplaceListing item;
  final Future<void> Function() onOpen;
  final bool isOpening;

  const _InstalledAgentCard({
    required this.item,
    required this.onOpen,
    this.isOpening = false,
  });

  @override
  State<_InstalledAgentCard> createState() => _InstalledAgentCardState();
}

class _InstalledAgentCardState extends State<_InstalledAgentCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final listing = widget.item.listing;
    final theme = Theme.of(context);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.isOpening ? null : () => widget.onOpen(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          decoration: BoxDecoration(
            color: _hovered ? RuhTheme.lightPurple : theme.cardColor,
            borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
            border: Border.all(
              color: _hovered
                  ? RuhTheme.primary.withValues(alpha: 0.28)
                  : RuhTheme.borderDefault,
            ),
            boxShadow: [
              if (_hovered)
                BoxShadow(
                  color: RuhTheme.primary.withValues(alpha: 0.08),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SoulPulse(
                      intensity: 0.55,
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: RuhTheme.accentLight,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          LucideIcons.sparkles,
                          color: RuhTheme.primary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            listing.title,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: RuhTheme.accentLight,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Installed from Marketplace',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: RuhTheme.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: Text(
                    listing.summary.isNotEmpty
                        ? listing.summary
                        : listing.description,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: RuhTheme.textSecondary,
                      height: 1.45,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _InfoChip(
                      icon: LucideIcons.tag,
                      label: listing.categoryLabel,
                    ),
                    _InfoChip(
                      icon: LucideIcons.package,
                      label: 'v${widget.item.installedVersion}',
                    ),
                    _InfoChip(
                      icon: LucideIcons.clock3,
                      label:
                          widget.item.lastLaunchedAt != null
                          ? 'Opened ${_formatInstalledDate(widget.item.lastLaunchedAt!)}'
                          : 'Installed ${_formatInstalledDate(widget.item.installedAt)}',
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: widget.isOpening ? null : () => widget.onOpen(),
                    icon: widget.isOpening
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(
                            LucideIcons.arrowUpRight,
                            size: IconSizes.sm,
                          ),
                    label: Text(
                      widget.isOpening ? 'Preparing runtime...' : 'Open chat',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: RuhTheme.accentLight,
        borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: IconSizes.xs, color: RuhTheme.textTertiary),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: RuhTheme.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

String _formatInstalledDate(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return 'recently';
  }
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final local = parsed.toLocal();
  return '${months[local.month - 1]} ${local.day}';
}
