import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/marketplace_listing.dart';
import '../services/api_client.dart';
import '../services/marketplace_service.dart';

class MarketplaceCatalogFilters {
  final String search;
  final String? category;

  const MarketplaceCatalogFilters({this.search = '', this.category});

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) {
      return true;
    }
    return other is MarketplaceCatalogFilters &&
        other.search == search &&
        other.category == category;
  }

  @override
  int get hashCode => Object.hash(search, category);
}

final marketplaceServiceProvider = Provider<MarketplaceService>((ref) {
  return MarketplaceService(client: ApiClient());
});

final marketplaceListingsProvider = FutureProvider.autoDispose
    .family<MarketplaceListingsResponse, MarketplaceCatalogFilters>((
      ref,
      filters,
    ) async {
      final service = ref.read(marketplaceServiceProvider);
      return service.listListings(
        search: filters.search,
        category: filters.category,
      );
    });

final marketplaceListingDetailProvider = FutureProvider.autoDispose
    .family<MarketplaceListing?, String>((ref, slug) async {
      final service = ref.read(marketplaceServiceProvider);
      return service.getListing(slug);
    });

final marketplaceInstalledIdsProvider = FutureProvider.autoDispose<Set<String>>(
  (ref) async {
    final service = ref.read(marketplaceServiceProvider);
    return service.listInstalledListingIds();
  },
);

final marketplaceInstalledListingsProvider =
    FutureProvider.autoDispose<List<InstalledMarketplaceListing>>((ref) async {
      final service = ref.read(marketplaceServiceProvider);
      return service.listInstalledListings();
    });
