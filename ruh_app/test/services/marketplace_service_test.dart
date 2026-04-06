import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/marketplace_service.dart';

class FakeBackendClient implements BackendClient {
  dynamic getResponseData;
  dynamic postResponseData;
  Object? getError;
  Object? postError;
  String? lastGetPath;
  Map<String, dynamic>? lastGetQueryParameters;
  String? lastPostPath;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    lastGetQueryParameters = queryParameters;
    if (getError != null) {
      throw getError!;
    }
    return Response<T>(
      data: getResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastPostPath = path;
    if (postError != null) {
      throw postError!;
    }
    return Response<T>(
      data: postResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return post<T>(path, data: data, queryParameters: queryParameters);
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<void> setAccessToken(String token) async {}

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<void> clearRefreshToken() async {}
}

void main() {
  group('MarketplaceService', () {
    test('parses marketplace listings and forwards filters', () async {
      final client = FakeBackendClient()
        ..getResponseData = {
          'items': [
            {
              'id': 'listing-sarah',
              'agentId': 'agent-sarah',
              'publisherId': 'publisher-1',
              'ownerOrgId': 'org-1',
              'title': 'Sarah Assistant',
              'slug': 'sarah-assistant-d15e3c9d',
              'summary': 'Warm executive assistant.',
              'description': 'Runs calendar and follow-ups.',
              'category': 'operations',
              'tags': ['assistant'],
              'iconUrl': null,
              'screenshots': [],
              'version': '1.2.0',
              'status': 'published',
              'reviewNotes': null,
              'reviewedBy': null,
              'reviewedAt': null,
              'installCount': 241,
              'avgRating': 4.9,
              'publishedAt': '2026-03-31T10:00:00.000Z',
              'createdAt': '2026-03-30T10:00:00.000Z',
              'updatedAt': '2026-03-31T10:00:00.000Z',
            },
          ],
          'total': 1,
        };
      final service = MarketplaceService(client: client);

      final result = await service.listListings(
        search: 'sarah',
        category: 'operations',
      );

      expect(client.lastGetPath, '/api/marketplace/listings');
      expect(client.lastGetQueryParameters, {
        'search': 'sarah',
        'category': 'operations',
      });
      expect(result.total, 1);
      expect(result.items.single.title, 'Sarah Assistant');
      expect(result.items.single.installCount, 241);
    });

    test('parses marketplace listing detail by slug', () async {
      final client = FakeBackendClient()
        ..getResponseData = {
          'id': 'listing-sarah',
          'agentId': 'agent-sarah',
          'publisherId': 'publisher-1',
          'ownerOrgId': 'org-1',
          'title': 'Sarah Assistant',
          'slug': 'sarah-assistant-d15e3c9d',
          'summary': 'Warm executive assistant.',
          'description': 'Runs calendar and follow-ups.',
          'category': 'operations',
          'tags': ['assistant'],
          'iconUrl': null,
          'screenshots': [],
          'version': '1.2.0',
          'status': 'published',
          'reviewNotes': null,
          'reviewedBy': null,
          'reviewedAt': null,
          'installCount': 241,
          'avgRating': 4.9,
          'publishedAt': '2026-03-31T10:00:00.000Z',
          'createdAt': '2026-03-30T10:00:00.000Z',
          'updatedAt': '2026-03-31T10:00:00.000Z',
        };
      final service = MarketplaceService(client: client);

      final listing = await service.getListing('sarah-assistant-d15e3c9d');

      expect(
        client.lastGetPath,
        '/api/marketplace/listings/sarah-assistant-d15e3c9d',
      );
      expect(listing, isNotNull);
      expect(listing!.slug, 'sarah-assistant-d15e3c9d');
      expect(listing.avgRating, 4.9);
    });

    test('installs a listing through the marketplace endpoint', () async {
      final client = FakeBackendClient();
      final service = MarketplaceService(client: client);

      await service.installListing('listing-sarah');

      expect(
        client.lastPostPath,
        '/api/marketplace/listings/listing-sarah/install',
      );
    });

    test(
      'parses installed marketplace listings for the customer workspace',
      () async {
        final client = FakeBackendClient()
          ..getResponseData = {
            'items': [
              {
                'installId': 'install-sarah',
                'listingId': 'listing-sarah',
                'orgId': 'org-1',
                'userId': 'user-1',
                'agentId': 'agent-runtime-sarah',
                'installedVersion': '1.2.0',
                'installedAt': '2026-04-01T12:00:00.000Z',
                'listing': {
                  'id': 'listing-sarah',
                  'agentId': 'agent-sarah',
                  'publisherId': 'publisher-1',
                  'ownerOrgId': 'org-1',
                  'title': 'Sarah Assistant',
                  'slug': 'sarah-assistant-d15e3c9d',
                  'summary': 'Warm executive assistant.',
                  'description': 'Runs calendar and follow-ups.',
                  'category': 'operations',
                  'tags': ['assistant'],
                  'iconUrl': null,
                  'screenshots': [],
                  'version': '1.2.0',
                  'status': 'published',
                  'reviewNotes': null,
                  'reviewedBy': null,
                  'reviewedAt': null,
                  'installCount': 241,
                  'avgRating': 4.9,
                  'publishedAt': '2026-03-31T10:00:00.000Z',
                  'createdAt': '2026-03-30T10:00:00.000Z',
                  'updatedAt': '2026-03-31T10:00:00.000Z',
                },
              },
            ],
          };
        final service = MarketplaceService(client: client);

        final result = await service.listInstalledListings();

        expect(client.lastGetPath, '/api/marketplace/my/installed-listings');
        expect(result, hasLength(1));
        expect(result.single.installId, 'install-sarah');
        expect(result.single.agentId, 'agent-runtime-sarah');
        expect(result.single.installedVersion, '1.2.0');
        expect(result.single.listing.title, 'Sarah Assistant');
      },
    );
  });
}
