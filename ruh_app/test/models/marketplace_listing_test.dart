import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/marketplace_listing.dart';

void main() {
  group('MarketplaceListing.fromJson', () {
    test('parses camelCase keys', () {
      final json = {
        'id': 'ml-1',
        'agentId': 'agent-1',
        'publisherId': 'pub-1',
        'ownerOrgId': 'org-1',
        'title': 'Ads Agent',
        'slug': 'ads-agent',
        'summary': 'Manages ads',
        'description': 'Full description here',
        'category': 'marketing',
        'tags': ['ads', 'google'],
        'iconUrl': 'https://img.example.com/icon.png',
        'screenshots': ['https://img.example.com/s1.png'],
        'version': '2.0.0',
        'status': 'published',
        'reviewNotes': 'Looks good',
        'reviewedBy': 'admin-1',
        'reviewedAt': '2025-06-01T00:00:00.000Z',
        'installCount': 150,
        'avgRating': 4.5,
        'publishedAt': '2025-05-01T00:00:00.000Z',
        'createdAt': '2025-04-01T00:00:00.000Z',
        'updatedAt': '2025-06-01T00:00:00.000Z',
      };

      final listing = MarketplaceListing.fromJson(json);

      expect(listing.id, 'ml-1');
      expect(listing.agentId, 'agent-1');
      expect(listing.publisherId, 'pub-1');
      expect(listing.ownerOrgId, 'org-1');
      expect(listing.title, 'Ads Agent');
      expect(listing.slug, 'ads-agent');
      expect(listing.summary, 'Manages ads');
      expect(listing.description, 'Full description here');
      expect(listing.category, 'marketing');
      expect(listing.tags, ['ads', 'google']);
      expect(listing.iconUrl, 'https://img.example.com/icon.png');
      expect(listing.screenshots, hasLength(1));
      expect(listing.version, '2.0.0');
      expect(listing.status, 'published');
      expect(listing.reviewNotes, 'Looks good');
      expect(listing.reviewedBy, 'admin-1');
      expect(listing.reviewedAt, '2025-06-01T00:00:00.000Z');
      expect(listing.installCount, 150);
      expect(listing.avgRating, 4.5);
      expect(listing.publishedAt, '2025-05-01T00:00:00.000Z');
    });

    test('parses snake_case keys via readString fallback', () {
      final json = {
        'id': 'ml-2',
        'agent_id': 'agent-2',
        'publisher_id': 'pub-2',
        'owner_org_id': 'org-2',
        'title': 'Support Agent',
        'slug': 'support-agent',
        'summary': 'Handles support',
        'description': 'Detailed desc',
        'category': 'support',
        'tags': [],
        'icon_url': 'https://img.example.com/icon2.png',
        'screenshots': [],
        'version': '1.0.0',
        'status': 'published',
        'review_notes': null,
        'reviewed_by': null,
        'reviewed_at': null,
        'install_count': 10,
        'avg_rating': 3.0,
        'published_at': '2025-03-01T00:00:00.000Z',
        'created_at': '2025-02-01T00:00:00.000Z',
        'updated_at': '2025-03-01T00:00:00.000Z',
      };

      final listing = MarketplaceListing.fromJson(json);

      expect(listing.agentId, 'agent-2');
      expect(listing.publisherId, 'pub-2');
      expect(listing.ownerOrgId, 'org-2');
      expect(listing.iconUrl, 'https://img.example.com/icon2.png');
      expect(listing.installCount, 10);
      expect(listing.avgRating, 3.0);
    });

    test('handles all nullable fields as null', () {
      final json = {
        'id': 'ml-3',
        'title': 'Minimal',
        'slug': 'minimal',
        'summary': '',
        'description': '',
        'category': '',
        'tags': [],
        'screenshots': [],
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      };

      final listing = MarketplaceListing.fromJson(json);

      expect(listing.ownerOrgId, isNull);
      expect(listing.iconUrl, isNull);
      expect(listing.reviewNotes, isNull);
      expect(listing.reviewedBy, isNull);
      expect(listing.reviewedAt, isNull);
      expect(listing.publishedAt, isNull);
      expect(listing.version, '1.0.0');
      expect(listing.status, 'published');
    });
  });

  group('MarketplaceListing.categoryLabel', () {
    test('capitalizes first letter of category', () {
      final listing = MarketplaceListing.fromJson({
        'id': 'cl-1',
        'title': 'x',
        'slug': 'x',
        'summary': '',
        'description': '',
        'category': 'marketing',
        'tags': [],
        'screenshots': [],
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      });

      expect(listing.categoryLabel, 'Marketing');
    });

    test('returns General for empty category', () {
      final listing = MarketplaceListing.fromJson({
        'id': 'cl-2',
        'title': 'x',
        'slug': 'x',
        'summary': '',
        'description': '',
        'category': '',
        'tags': [],
        'screenshots': [],
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      });

      expect(listing.categoryLabel, 'General');
    });
  });

  group('MarketplaceListingsResponse.fromJson', () {
    test('parses items and total', () {
      final json = {
        'items': [
          {
            'id': 'ml-r1',
            'title': 'Agent 1',
            'slug': 'agent-1',
            'summary': '',
            'description': '',
            'category': '',
            'tags': [],
            'screenshots': [],
            'created_at': '2025-01-01T00:00:00.000Z',
            'updated_at': '2025-01-01T00:00:00.000Z',
          },
        ],
        'total': 50,
      };

      final resp = MarketplaceListingsResponse.fromJson(json);

      expect(resp.items, hasLength(1));
      expect(resp.total, 50);
    });

    test('falls back to items.length when total is missing', () {
      final json = {
        'items': [
          {
            'id': 'ml-r2',
            'title': 'Agent 2',
            'slug': 'agent-2',
            'summary': '',
            'description': '',
            'category': '',
            'tags': [],
            'screenshots': [],
            'created_at': '2025-01-01T00:00:00.000Z',
            'updated_at': '2025-01-01T00:00:00.000Z',
          },
          {
            'id': 'ml-r3',
            'title': 'Agent 3',
            'slug': 'agent-3',
            'summary': '',
            'description': '',
            'category': '',
            'tags': [],
            'screenshots': [],
            'created_at': '2025-01-01T00:00:00.000Z',
            'updated_at': '2025-01-01T00:00:00.000Z',
          },
        ],
      };

      final resp = MarketplaceListingsResponse.fromJson(json);

      expect(resp.items, hasLength(2));
      expect(resp.total, 2);
    });
  });

  group('InstalledMarketplaceListing.fromJson', () {
    test('parses with nested listing map', () {
      final json = {
        'installId': 'inst-1',
        'listingId': 'ml-1',
        'orgId': 'org-1',
        'userId': 'user-1',
        'agentId': 'agent-1',
        'sourceAgentVersionId': 'ver-1',
        'installedVersion': '2.0.0',
        'installedAt': '2025-06-01T00:00:00.000Z',
        'lastLaunchedAt': '2025-06-02T00:00:00.000Z',
        'listing': {
          'id': 'ml-1',
          'title': 'Agent',
          'slug': 'agent',
          'summary': '',
          'description': '',
          'category': 'marketing',
          'tags': [],
          'screenshots': [],
          'version': '2.0.0',
          'createdAt': '2025-01-01T00:00:00.000Z',
          'updatedAt': '2025-01-01T00:00:00.000Z',
        },
      };

      final installed = InstalledMarketplaceListing.fromJson(json);

      expect(installed.installId, 'inst-1');
      expect(installed.listingId, 'ml-1');
      expect(installed.orgId, 'org-1');
      expect(installed.userId, 'user-1');
      expect(installed.agentId, 'agent-1');
      expect(installed.sourceAgentVersionId, 'ver-1');
      expect(installed.installedVersion, '2.0.0');
      expect(installed.installedAt, '2025-06-01T00:00:00.000Z');
      expect(installed.lastLaunchedAt, '2025-06-02T00:00:00.000Z');
      expect(installed.listing.id, 'ml-1');
      expect(installed.listing.category, 'marketing');
    });

    test('handles non-map listing gracefully (empty default)', () {
      final json = {
        'installId': 'inst-2',
        'listingId': 'ml-2',
        'userId': 'user-2',
        'agentId': 'agent-2',
        'installedAt': '2025-06-01T00:00:00.000Z',
        'listing': 'not-a-map',
      };

      final installed = InstalledMarketplaceListing.fromJson(json);

      expect(installed.installId, 'inst-2');
      expect(installed.listing.id, '');
      expect(installed.listing.title, '');
      expect(installed.orgId, isNull);
      expect(installed.sourceAgentVersionId, isNull);
      expect(installed.lastLaunchedAt, isNull);
    });
  });
}
