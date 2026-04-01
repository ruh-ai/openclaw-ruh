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

const _categoryOptions = [
  '',
  'general',
  'marketing',
  'sales',
  'support',
  'engineering',
  'data',
  'finance',
  'hr',
  'operations',
  'custom',
];

class MarketplaceScreen extends ConsumerStatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  ConsumerState<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends ConsumerState<MarketplaceScreen> {
  String _searchQuery = '';
  String _selectedCategory = '';

  @override
  Widget build(BuildContext context) {
    final filters = MarketplaceCatalogFilters(
      search: _searchQuery,
      category: _selectedCategory.isEmpty ? null : _selectedCategory,
    );
    final listingsAsync = ref.watch(marketplaceListingsProvider(filters));
    final installedIdsAsync = ref.watch(marketplaceInstalledIdsProvider);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHero(context)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
              child: Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(color: RuhTheme.borderDefault),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    _buildSearchBar(context),
                    const SizedBox(height: 14),
                    _buildCategoryChips(context),
                  ],
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Published Agents',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: RuhTheme.borderDefault),
                    ),
                    child: Text(
                      listingsAsync.maybeWhen(
                        data: (response) => '${response.total} live',
                        orElse: () => 'Live catalog',
                      ),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: RuhTheme.textTertiary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: listingsAsync.when(
                data: (response) => _MarketplaceGrid(
                  listings: response.items,
                  installedIds: installedIdsAsync.valueOrNull ?? const <String>{},
                ),
                loading: () => const _MarketplaceLoadingGrid(),
                error: (error, _) => _MarketplaceErrorState(
                  message: error.toString(),
                ),
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 32)),
        ],
      ),
    );
  }

  Widget _buildHero(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 12),
      child: GradientDrift(
        borderRadius: BorderRadius.circular(32),
        colors: const [
          Color(0xFFFEF6FF),
          Color(0xFFF5ECFF),
          Color(0xFFF7F1FF),
        ],
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 32, 28, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.88),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'Real catalog',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: RuhTheme.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Find your next digital employee',
                style: Theme.of(context).textTheme.displayMedium?.copyWith(
                  color: RuhTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Browse trusted agents for operations, support, sales, and more.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: RuhTheme.textSecondary,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: const [
                  _HeroStat(label: 'Live catalog', value: 'Agents'),
                  _HeroStat(label: 'Install flow', value: 'Workspace-ready'),
                  _HeroStat(label: 'Best for', value: 'Teams'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchBar(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: RuhTheme.background,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: TextField(
        onChanged: (value) => setState(() => _searchQuery = value),
        decoration: InputDecoration(
          hintText: 'Search published agents...',
          hintStyle: TextStyle(color: RuhTheme.textTertiary, fontSize: 15),
          prefixIcon: const Icon(
            LucideIcons.search,
            color: RuhTheme.textTertiary,
            size: 18,
          ),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryChips(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _categoryOptions.map((category) {
        final isSelected = category == _selectedCategory;
        final label = category.isEmpty
            ? 'All'
            : category[0].toUpperCase() + category.substring(1);

        return FilterChip(
          label: Text(label),
          selected: isSelected,
          onSelected: (_) => setState(() => _selectedCategory = category),
          labelStyle: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? Colors.white : RuhTheme.textSecondary,
          ),
          backgroundColor: Colors.white,
          selectedColor: RuhTheme.primary,
          side: BorderSide(
            color: isSelected ? RuhTheme.primary : RuhTheme.borderDefault,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999),
          ),
          showCheckmark: false,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        );
      }).toList(),
    );
  }
}

class _HeroStat extends StatelessWidget {
  final String label;
  final String value;

  const _HeroStat({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: RuhTheme.textTertiary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _MarketplaceGrid extends StatelessWidget {
  final List<MarketplaceListing> listings;
  final Set<String> installedIds;

  const _MarketplaceGrid({
    required this.listings,
    required this.installedIds,
  });

  @override
  Widget build(BuildContext context) {
    if (listings.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: RuhTheme.borderDefault),
        ),
        child: Column(
          children: [
            const Icon(
              LucideIcons.store,
              size: 36,
              color: RuhTheme.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'No published agents match this filter',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Try a broader search or switch categories.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: RuhTheme.textSecondary,
              ),
            ),
          ],
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth >= Breakpoints.desktop
            ? 3
            : constraints.maxWidth >= Breakpoints.tablet
                ? 2
                : 1;

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            childAspectRatio: constraints.maxWidth >= Breakpoints.tablet
                ? 1.08
                : 1.22,
          ),
          itemCount: listings.length,
          itemBuilder: (context, index) {
            final listing = listings[index];
            return _MarketplaceCard(
              listing: listing,
              installed: installedIds.contains(listing.id),
            );
          },
        );
      },
    );
  }
}

class _MarketplaceCard extends StatefulWidget {
  final MarketplaceListing listing;
  final bool installed;

  const _MarketplaceCard({
    required this.listing,
    required this.installed,
  });

  @override
  State<_MarketplaceCard> createState() => _MarketplaceCardState();
}

class _MarketplaceCardState extends State<_MarketplaceCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final listing = widget.listing;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: InkWell(
        onTap: () => context.go('/marketplace/${listing.slug}'),
        borderRadius: BorderRadius.circular(28),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: _hovered ? RuhTheme.lightPurple : Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: _hovered
                  ? RuhTheme.primary.withValues(alpha: 0.28)
                  : RuhTheme.borderDefault,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: _hovered ? 0.07 : 0.04),
                blurRadius: _hovered ? 26 : 14,
                offset: Offset(0, _hovered ? 14 : 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SoulPulse(
                    intensity: 0.45,
                    child: Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: RuhTheme.accentLight,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        LucideIcons.sparkles,
                        color: RuhTheme.primary,
                        size: 22,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          listing.title,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: RuhTheme.textPrimary,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          listing.categoryLabel,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: RuhTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (widget.installed)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: RuhTheme.success.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        'Installed',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: const Color(0xFF15803D),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                listing.summary.isEmpty ? listing.description : listing.summary,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: RuhTheme.textSecondary,
                  height: 1.5,
                ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const Spacer(),
              Row(
                children: [
                  const Icon(
                    LucideIcons.download,
                    size: 14,
                    color: RuhTheme.textTertiary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${listing.installCount} installs',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: RuhTheme.textTertiary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Icon(
                    LucideIcons.star,
                    size: 14,
                    color: RuhTheme.starColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    listing.avgRating.toStringAsFixed(1),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: RuhTheme.textTertiary,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    LucideIcons.arrowRight,
                    size: 16,
                    color: _hovered ? RuhTheme.primary : RuhTheme.textTertiary,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MarketplaceLoadingGrid extends StatelessWidget {
  const _MarketplaceLoadingGrid();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossAxisCount = constraints.maxWidth >= Breakpoints.desktop
            ? 3
            : constraints.maxWidth >= Breakpoints.tablet
                ? 2
                : 1;

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
            childAspectRatio: constraints.maxWidth >= Breakpoints.tablet
                ? 1.08
                : 1.22,
          ),
          itemCount: crossAxisCount * 2,
          itemBuilder: (context, index) => const AgentCardSkeleton(),
        );
      },
    );
  }
}

class _MarketplaceErrorState extends StatelessWidget {
  final String message;

  const _MarketplaceErrorState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: Column(
        children: [
          const Icon(
            LucideIcons.alertTriangle,
            size: 36,
            color: RuhTheme.warning,
          ),
          const SizedBox(height: 12),
          Text(
            'Marketplace failed to load',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: RuhTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
