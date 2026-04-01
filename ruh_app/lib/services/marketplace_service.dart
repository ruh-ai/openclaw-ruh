import '../models/marketplace_listing.dart';
import 'api_client.dart';

class MarketplaceService {
  MarketplaceService({BackendClient? client}) : _client = client ?? ApiClient();

  final BackendClient _client;

  Future<MarketplaceListingsResponse> listListings({
    String? search,
    String? category,
  }) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/marketplace/listings',
      queryParameters: {
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (category != null && category.trim().isNotEmpty)
          'category': category.trim(),
      },
    );

    return MarketplaceListingsResponse.fromJson(response.data ?? const {});
  }

  Future<MarketplaceListing?> getListing(String slug) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/marketplace/listings/$slug',
      );
      final data = response.data;
      if (data == null) {
        return null;
      }

      return MarketplaceListing.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  Future<Set<String>> listInstalledListingIds() async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/marketplace/my/installs',
      );
      final items = response.data?['items'] as List<dynamic>? ?? const [];
      return items
          .map((item) {
            if (item is! Map<String, dynamic>) {
              return null;
            }
            return item['listingId']?.toString() ??
                item['listing_id']?.toString();
          })
          .whereType<String>()
          .toSet();
    } catch (_) {
      return <String>{};
    }
  }

  Future<List<InstalledMarketplaceListing>> listInstalledListings() async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/marketplace/my/installed-listings',
    );
    final items = response.data?['items'] as List<dynamic>? ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(InstalledMarketplaceListing.fromJson)
        .toList();
  }

  Future<void> installListing(String listingId) async {
    await _client.post<void>('/api/marketplace/listings/$listingId/install');
  }
}
