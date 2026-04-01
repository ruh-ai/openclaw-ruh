import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ruh_app/models/marketplace_listing.dart';
import 'package:ruh_app/providers/marketplace_provider.dart';
import 'package:ruh_app/screens/marketplace/marketplace_detail_screen.dart';
import 'package:ruh_app/screens/marketplace/marketplace_screen.dart';
import 'package:ruh_app/services/marketplace_service.dart';

class FakeMarketplaceService extends MarketplaceService {
  FakeMarketplaceService({
    required this.listings,
    required this.listingBySlug,
    this.installedIds = const {},
  });

  final List<MarketplaceListing> listings;
  final Map<String, MarketplaceListing> listingBySlug;
  Set<String> installedIds;
  String? lastListingSlug;
  String? lastInstalledListingId;

  @override
  Future<MarketplaceListingsResponse> listListings({
    String? search,
    String? category,
  }) async {
    final normalizedSearch = (search ?? '').trim().toLowerCase();
    final normalizedCategory = (category ?? '').trim().toLowerCase();
    final filtered = listings.where((listing) {
      final matchesSearch =
          normalizedSearch.isEmpty ||
          listing.title.toLowerCase().contains(normalizedSearch) ||
          listing.summary.toLowerCase().contains(normalizedSearch) ||
          listing.description.toLowerCase().contains(normalizedSearch);
      final matchesCategory =
          normalizedCategory.isEmpty ||
          listing.category.toLowerCase() == normalizedCategory;
      return matchesSearch && matchesCategory;
    }).toList();

    return MarketplaceListingsResponse(items: filtered, total: filtered.length);
  }

  @override
  Future<MarketplaceListing?> getListing(String slug) async {
    lastListingSlug = slug;
    return listingBySlug[slug];
  }

  @override
  Future<Set<String>> listInstalledListingIds() async {
    return installedIds;
  }

  @override
  Future<void> installListing(String listingId) async {
    lastInstalledListingId = listingId;
    installedIds = {...installedIds, listingId};
  }
}

void main() {
  const listing = MarketplaceListing(
    id: 'listing-sarah',
    agentId: 'agent-sarah',
    publisherId: 'publisher-1',
    ownerOrgId: 'org-1',
    title: 'Sarah Assistant',
    slug: 'sarah-assistant-d15e3c9d',
    summary: 'Warm executive assistant.',
    description: 'Runs calendar and follow-ups.',
    category: 'operations',
    tags: ['assistant'],
    iconUrl: null,
    screenshots: [],
    version: '1.2.0',
    status: 'published',
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    installCount: 241,
    avgRating: 4.9,
    publishedAt: null,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-31T10:00:00.000Z',
  );

  testWidgets('renders the live marketplace list from provider data', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(430, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final marketplaceService = FakeMarketplaceService(
      listings: const [listing],
      listingBySlug: const {'sarah-assistant-d15e3c9d': listing},
    );
    final container = ProviderContainer(
      overrides: [
        marketplaceServiceProvider.overrideWithValue(marketplaceService),
      ],
    );
    addTearDown(container.dispose);
    await container.read(
      marketplaceListingsProvider(
        const MarketplaceCatalogFilters(),
      ).future,
    );
    await container.read(marketplaceInstalledIdsProvider.future);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: MarketplaceScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.scrollUntilVisible(
      find.text('Sarah Assistant'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Find your next digital employee'), findsOneWidget);
    expect(
      find.text('Browse trusted agents for operations, support, sales, and more.'),
      findsOneWidget,
    );
    expect(find.text('Sarah Assistant'), findsOneWidget);
    expect(find.text('Warm executive assistant.'), findsOneWidget);
  });

  testWidgets('renders the marketplace detail route and installs', (tester) async {
    tester.view.physicalSize = const Size(430, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final marketplaceService = FakeMarketplaceService(
      listings: const [listing],
      listingBySlug: const {'sarah-assistant-d15e3c9d': listing},
    );
    final container = ProviderContainer(
      overrides: [
        marketplaceServiceProvider.overrideWithValue(marketplaceService),
      ],
    );
    addTearDown(container.dispose);
    await container.read(
      marketplaceListingDetailProvider('sarah-assistant-d15e3c9d').future,
    );
    await container.read(marketplaceInstalledIdsProvider.future);

    final router = GoRouter(
      initialLocation: '/marketplace/sarah-assistant-d15e3c9d',
      routes: [
        GoRoute(
          path: '/marketplace',
          builder: (context, state) => const MarketplaceScreen(),
        ),
        GoRoute(
          path: '/marketplace/:slug',
          builder: (context, state) => MarketplaceDetailScreen(
            slug: state.pathParameters['slug']!,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(router.routeInformationProvider.value.uri.toString(), '/marketplace/sarah-assistant-d15e3c9d');
    expect(marketplaceService.lastListingSlug, 'sarah-assistant-d15e3c9d');
    expect(find.text('What this agent helps with'), findsOneWidget);
    expect(find.text('Runs calendar and follow-ups.'), findsOneWidget);

    await tester.tap(find.text('Install Agent'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(marketplaceService.lastInstalledListingId, 'listing-sarah');
    expect(
      find.widgetWithText(ElevatedButton, 'View Installed Agents'),
      findsOneWidget,
    );
  });
}
