import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../models/marketplace_listing.dart';
import '../../providers/marketplace_provider.dart';
import '../../widgets/alive_animations.dart';
import '../../widgets/skeleton_loader.dart';

class MarketplaceDetailScreen extends ConsumerStatefulWidget {
  final String slug;

  const MarketplaceDetailScreen({super.key, required this.slug});

  @override
  ConsumerState<MarketplaceDetailScreen> createState() =>
      _MarketplaceDetailScreenState();
}

class _MarketplaceDetailScreenState
    extends ConsumerState<MarketplaceDetailScreen> {
  bool _isInstalling = false;
  bool? _installedOverride;
  int? _installCountOverride;

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(
      marketplaceListingDetailProvider(widget.slug),
    );
    final installedIdsAsync = ref.watch(marketplaceInstalledIdsProvider);

    return Scaffold(
      body: detailAsync.when(
        data: (listing) {
          if (listing == null) {
            return _UnavailableState(slug: widget.slug);
          }

          final bool installed =
              _installedOverride ??
              installedIdsAsync.maybeWhen<bool>(
                data: (ids) => ids.contains(listing.id),
                orElse: () => false,
              );
          final installCount = _installCountOverride ?? listing.installCount;

          return _DetailBody(
            listing: listing,
            installCount: installCount,
            installed: installed,
            isInstalling: _isInstalling,
            onInstall: () => _handleInstall(listing),
          );
        },
        loading: () => const _MarketplaceDetailSkeleton(),
        error: (error, _) =>
            _UnavailableState(slug: widget.slug, message: error.toString()),
      ),
    );
  }

  Future<void> _handleInstall(MarketplaceListing listing) async {
    if (_isInstalling || _installedOverride == true) {
      return;
    }

    setState(() {
      _isInstalling = true;
    });

    try {
      await ref.read(marketplaceServiceProvider).installListing(listing.id);

      if (!mounted) {
        return;
      }

      setState(() {
        _installedOverride = true;
        _installCountOverride = listing.installCount + 1;
      });
      ref.invalidate(marketplaceInstalledIdsProvider);
      ref.invalidate(marketplaceInstalledListingsProvider);
      ref.invalidate(marketplaceListingDetailProvider(widget.slug));

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Agent added to your installed workspace'),
        ),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not install this agent')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isInstalling = false;
        });
      }
    }
  }
}

class _DetailBody extends StatelessWidget {
  final MarketplaceListing listing;
  final int installCount;
  final bool installed;
  final bool isInstalling;
  final VoidCallback onInstall;

  const _DetailBody({
    required this.listing,
    required this.installCount,
    required this.installed,
    required this.isInstalling,
    required this.onInstall,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= Breakpoints.desktop;

        return CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
                child: Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => context.go('/marketplace'),
                      icon: const Icon(LucideIcons.arrowLeft, size: 16),
                      label: const Text('Back to Marketplace'),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: GradientDrift(
                  borderRadius: BorderRadius.circular(32),
                  colors: const [
                    Color(0xFFFEF6FF),
                    Color(0xFFF6EEFF),
                    Color(0xFFFDF3F8),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: _HeroHeader(listing: listing),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
                child: isWide
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            flex: 3,
                            child: _DetailContent(
                              listing: listing,
                              installCount: installCount,
                            ),
                          ),
                          const SizedBox(width: 20),
                          Expanded(
                            flex: 2,
                            child: _InstallPanel(
                              installed: installed,
                              isInstalling: isInstalling,
                              onInstall: onInstall,
                              onViewWorkspace: () => context.go('/'),
                            ),
                          ),
                        ],
                      )
                    : Column(
                        children: [
                          _InstallPanel(
                            installed: installed,
                            isInstalling: isInstalling,
                            onInstall: onInstall,
                            onViewWorkspace: () => context.go('/'),
                          ),
                          const SizedBox(height: 20),
                          _DetailContent(
                            listing: listing,
                            installCount: installCount,
                          ),
                        ],
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _HeroHeader extends StatelessWidget {
  final MarketplaceListing listing;

  const _HeroHeader({required this.listing});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SoulPulse(
          intensity: 0.6,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              color: Colors.white.withValues(alpha: 0.9),
            ),
            child: Icon(
              LucideIcons.sparkles,
              color: RuhTheme.primary,
              size: 28,
            ),
          ),
        ),
        const SizedBox(width: 18),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _HeroBadge(label: listing.categoryLabel),
                  _HeroBadge(label: 'Version ${listing.version}'),
                  if (listing.publishedAt != null)
                    _HeroBadge(
                      label: 'Published ${_formatDate(listing.publishedAt)}',
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                listing.title,
                style: theme.textTheme.displayMedium?.copyWith(
                  color: RuhTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                listing.summary.isEmpty ? listing.description : listing.summary,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: RuhTheme.textSecondary,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) {
      return 'recently';
    }

    final parsed = DateTime.tryParse(iso);
    if (parsed == null) {
      return 'recently';
    }

    final month = _monthNames[parsed.month - 1];
    return '$month ${parsed.day}, ${parsed.year}';
  }
}

class _HeroBadge extends StatelessWidget {
  final String label;

  const _HeroBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: RuhTheme.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _DetailContent extends StatelessWidget {
  final MarketplaceListing listing;
  final int installCount;

  const _DetailContent({required this.listing, required this.installCount});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        _MetricCardRow(
          children: [
            _MetricCard(
              title: 'Adoption',
              value: '$installCount',
              subtitle: '$installCount installs',
            ),
            _MetricCard(
              title: 'Rating',
              value: listing.avgRating.toStringAsFixed(1),
              subtitle: '${listing.avgRating.toStringAsFixed(1)} rating',
            ),
            _MetricCard(
              title: 'Status',
              value: listing.status.toUpperCase(),
              subtitle: 'Ready for customer workspace install',
            ),
          ],
        ),
        const SizedBox(height: 20),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: RuhTheme.borderDefault),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'What this agent helps with',
                style: theme.textTheme.headlineLarge?.copyWith(
                  color: RuhTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                listing.description,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: RuhTheme.textSecondary,
                  height: 1.7,
                ),
              ),
              if (listing.tags.isNotEmpty) ...[
                const SizedBox(height: 18),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: listing.tags
                      .map(
                        (tag) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: RuhTheme.accentLight,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            tag,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: RuhTheme.textSecondary,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MetricCardRow extends StatelessWidget {
  final List<Widget> children;

  const _MetricCardRow({required this.children});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isWide = constraints.maxWidth >= Breakpoints.tablet;

        if (!isWide) {
          return Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                children[i],
                if (i != children.length - 1) const SizedBox(height: 12),
              ],
            ],
          );
        }

        return Row(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              Expanded(child: children[i]),
              if (i != children.length - 1) const SizedBox(width: 12),
            ],
          ],
        );
      },
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;
  final String subtitle;

  const _MetricCard({
    required this.title,
    required this.value,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: theme.textTheme.labelMedium?.copyWith(
              color: RuhTheme.textTertiary,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: theme.textTheme.displaySmall?.copyWith(
              color: RuhTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: theme.textTheme.bodySmall?.copyWith(
              color: RuhTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _InstallPanel extends StatelessWidget {
  final bool installed;
  final bool isInstalling;
  final VoidCallback onInstall;
  final VoidCallback onViewWorkspace;

  const _InstallPanel({
    required this.installed,
    required this.isInstalling,
    required this.onInstall,
    required this.onViewWorkspace,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF251D2B),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 32,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Workspace access',
            style: theme.textTheme.labelMedium?.copyWith(
              color: Colors.white70,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            installed ? 'Installed to your workspace' : 'Ready to join your workspace',
            style: theme.textTheme.headlineLarge?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 12),
          Text(
            installed
                ? 'This agent is now available from the Installed Agents workspace for your current organization.'
                : 'Install this agent for the current customer organization and bring it into your workspace.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white70,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isInstalling
                  ? null
                  : installed
                  ? onViewWorkspace
                  : onInstall,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFF4D1AF),
                foregroundColor: const Color(0xFF2C1E13),
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
              child: Text(
                isInstalling
                    ? 'Installing...'
                    : installed
                    ? 'View Installed Agents'
                    : 'Install Agent',
              ),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Text(
              installed
                  ? 'From here, your team can open the installed agent and launch it into chat when needed.'
                  : 'Best for teams that want to evaluate a new digital employee before using it live.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: Colors.white70,
                height: 1.6,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _UnavailableState extends StatelessWidget {
  final String slug;
  final String? message;

  const _UnavailableState({required this.slug, this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.alertCircle,
              size: 40,
              color: RuhTheme.warning,
            ),
            const SizedBox(height: 16),
            Text(
              'Listing unavailable',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              message ?? 'The marketplace listing "$slug" could not be loaded.',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: RuhTheme.textSecondary),
            ),
            const SizedBox(height: 20),
            OutlinedButton(
              onPressed: () => context.go('/marketplace'),
              child: const Text('Back to Marketplace'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MarketplaceDetailSkeleton extends StatelessWidget {
  const _MarketplaceDetailSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: const [
        SkeletonLoader(width: 160, height: 40, borderRadius: 16),
        SizedBox(height: 16),
        SkeletonLoader(height: 220, borderRadius: 28),
        SizedBox(height: 20),
        SkeletonLoader(height: 150, borderRadius: 28),
        SizedBox(height: 20),
        SkeletonLoader(height: 260, borderRadius: 28),
      ],
    );
  }
}

const _monthNames = [
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
