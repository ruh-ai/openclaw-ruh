import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ruh_app/models/agent.dart';
import 'package:ruh_app/models/marketplace_listing.dart';
import 'package:ruh_app/providers/agent_provider.dart';
import 'package:ruh_app/providers/marketplace_provider.dart';
import 'package:ruh_app/screens/agents/agent_list_screen.dart';
import 'package:ruh_app/services/agent_service.dart';
import 'package:ruh_app/services/marketplace_service.dart';

class FakeMarketplaceService extends MarketplaceService {
  FakeMarketplaceService({this.installedListings = const []});

  final List<InstalledMarketplaceListing> installedListings;

  @override
  Future<List<InstalledMarketplaceListing>> listInstalledListings() async {
    return installedListings;
  }
}

class FakeAgentService extends AgentService {
  FakeAgentService({required this.launchResult});

  final Agent launchResult;
  String? launchedAgentId;

  @override
  Future<Agent> launchAgent(String id) async {
    launchedAgentId = id;
    return launchResult;
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
      expect(find.text('Open chat'), findsOneWidget);
    },
  );

  testWidgets(
    'tapping open chat launches the runtime and navigates directly to chat',
    (tester) async {
      tester.view.physicalSize = const Size(1280, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final agentService = FakeAgentService(
        launchResult: Agent(
          id: 'agent-runtime-sarah',
          name: 'Sarah Assistant',
          description: 'Warm executive assistant.',
          status: 'active',
          sandboxIds: const ['sandbox-1'],
          createdAt: DateTime.parse('2026-04-02T10:00:00.000Z'),
          updatedAt: DateTime.parse('2026-04-02T10:00:00.000Z'),
        ),
      );
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const AgentListScreen(),
          ),
          GoRoute(
            path: '/chat/:agentId',
            builder: (context, state) => Text(
              'Chat ${state.pathParameters['agentId']}',
            ),
          ),
          GoRoute(
            path: '/agents/:agentId',
            builder: (context, state) => Text(
              'Compat ${state.pathParameters['agentId']}',
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            marketplaceServiceProvider.overrideWithValue(
              FakeMarketplaceService(
                installedListings: [buildInstalledListing()],
              ),
            ),
            agentServiceProvider.overrideWithValue(agentService),
          ],
          child: MaterialApp.router(routerConfig: router),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      await tester.tap(find.text('Open chat'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(agentService.launchedAgentId, 'agent-runtime-sarah');
      expect(find.text('Chat agent-runtime-sarah'), findsOneWidget);
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
