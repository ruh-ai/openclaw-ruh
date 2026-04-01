import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/marketplace_listing.dart';
import 'package:ruh_app/providers/marketplace_provider.dart';
import 'package:ruh_app/screens/agents/agent_list_screen.dart';
import 'package:ruh_app/services/marketplace_service.dart';

class FakeMarketplaceService extends MarketplaceService {
  FakeMarketplaceService({this.installedListings = const []});

  final List<InstalledMarketplaceListing> installedListings;

  @override
  Future<List<InstalledMarketplaceListing>> listInstalledListings() async {
    return installedListings;
  }
}

InstalledMarketplaceListing buildInstalledListing({
  String title = 'Sarah Assistant',
  String slug = 'sarah-assistant-d15e3c9d',
}) {
  return InstalledMarketplaceListing(
    installId: 'install-sarah',
    listingId: 'listing-sarah',
    orgId: 'org-1',
    userId: 'user-1',
    agentId: 'agent-runtime-sarah',
    installedVersion: '1.2.0',
    installedAt: '2026-04-01T12:00:00.000Z',
    listing: MarketplaceListing(
      id: 'listing-sarah',
      agentId: 'agent-sarah',
      publisherId: 'publisher-1',
      ownerOrgId: 'org-1',
      title: title,
      slug: slug,
      summary: 'Warm executive assistant.',
      description: 'Runs calendar and follow-ups.',
      category: 'operations',
      tags: const ['assistant'],
      iconUrl: null,
      screenshots: const [],
      version: '1.2.0',
      status: 'published',
      reviewNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      installCount: 241,
      avgRating: 4.9,
      publishedAt: '2026-03-31T10:00:00.000Z',
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-31T10:00:00.000Z',
    ),
  );
}

void main() {
  testWidgets(
    'renders installed marketplace agents on the customer dashboard',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            marketplaceServiceProvider.overrideWithValue(
              FakeMarketplaceService(
                installedListings: [buildInstalledListing()],
              ),
            ),
          ],
          child: const MaterialApp(home: AgentListScreen()),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Installed agents'), findsOneWidget);
      expect(find.text('1 ready to open'), findsOneWidget);
      expect(find.text('Sarah Assistant'), findsOneWidget);
      expect(find.text('Installed from Marketplace'), findsOneWidget);
      expect(find.text('Open agent'), findsOneWidget);
    },
  );

  testWidgets(
    'shows the marketplace-first empty state when nothing is installed',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            marketplaceServiceProvider.overrideWithValue(
              FakeMarketplaceService(),
            ),
          ],
          child: const MaterialApp(home: AgentListScreen()),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Installed agents'), findsOneWidget);
      expect(find.text('No agents installed'), findsOneWidget);
      expect(find.text('No installed agents yet'), findsOneWidget);
      expect(
        find.text(
          'Install agents from the marketplace to bring them into your workspace.',
        ),
        findsOneWidget,
      );
      expect(find.text('Browse Marketplace'), findsOneWidget);
    },
  );
}
