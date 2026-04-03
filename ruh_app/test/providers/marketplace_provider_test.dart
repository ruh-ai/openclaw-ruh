import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ruh_app/models/marketplace_listing.dart';
import 'package:ruh_app/providers/marketplace_provider.dart';
import 'package:ruh_app/services/marketplace_service.dart';

import '../test_support/fakes.dart';

MarketplaceListing _listing({String id = 'listing-1', String title = 'Bot'}) {
  return MarketplaceListing.fromJson({
    'id': id,
    'agentId': 'a1',
    'publisherId': 'p1',
    'title': title,
    'slug': title.toLowerCase(),
    'summary': 'A bot',
    'description': 'A test bot',
    'category': 'productivity',
    'tags': <String>[],
    'screenshots': <String>[],
    'installCount': 10,
    'avgRating': 4.5,
    'createdAt': '2024-01-01T00:00:00Z',
    'updatedAt': '2024-01-01T00:00:00Z',
  });
}

void main() {
  group('marketplaceListingsProvider', () {
    test('passes filters to service', () async {
      final fake = FakeMarketplaceService()
        ..listResult = MarketplaceListingsResponse(
          items: [_listing()],
          total: 1,
        );

      final container = ProviderContainer(
        overrides: [marketplaceServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      const filters = MarketplaceCatalogFilters(
        search: 'bot',
        category: 'productivity',
      );
      final result = await container.read(
        marketplaceListingsProvider(filters).future,
      );

      expect(result.items, hasLength(1));
      expect(result.total, 1);
    });
  });

  group('marketplaceListingDetailProvider', () {
    test('fetches listing by slug', () async {
      final listing = _listing(title: 'Helper');
      final fake = FakeMarketplaceService()..getResult = listing;

      final container = ProviderContainer(
        overrides: [marketplaceServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final result = await container.read(
        marketplaceListingDetailProvider('helper').future,
      );

      expect(result?.title, 'Helper');
    });
  });

  group('marketplaceInstalledIdsProvider', () {
    test('returns set of installed listing IDs', () async {
      final fake = FakeMarketplaceService()
        ..installedIdsResult = {'listing-1', 'listing-2'};

      final container = ProviderContainer(
        overrides: [marketplaceServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final ids = await container.read(
        marketplaceInstalledIdsProvider.future,
      );

      expect(ids, containsAll(['listing-1', 'listing-2']));
    });
  });
}
