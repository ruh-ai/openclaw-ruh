import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ruh_app/providers/agent_provider.dart';

import '../test_support/fakes.dart';

void main() {
  group('agentListProvider', () {
    test('loads agents from service', () async {
      final fake = FakeAgentService()
        ..listResult = [buildAgent(id: 'a1'), buildAgent(id: 'a2')];

      final container = ProviderContainer(
        overrides: [agentServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      // Wait for the async build to complete
      await container.read(agentListProvider.future);

      final agents = container.read(agentListProvider).valueOrNull!;
      expect(agents, hasLength(2));
      expect(agents[0].id, 'a1');
    });

    test('exposes error state on failure', () async {
      final fake = FakeAgentService()
        ..listError = Exception('network down');

      final container = ProviderContainer(
        overrides: [agentServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      try {
        await container.read(agentListProvider.future);
      } catch (_) {}

      final state = container.read(agentListProvider);
      expect(state.hasError, isTrue);
    });

    test('refresh re-fetches the list', () async {
      final fake = FakeAgentService()
        ..listResult = [buildAgent(id: 'a1')];

      final container = ProviderContainer(
        overrides: [agentServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      await container.read(agentListProvider.future);
      expect(container.read(agentListProvider).valueOrNull, hasLength(1));

      fake.listResult = [buildAgent(id: 'a1'), buildAgent(id: 'a2')];
      await container.read(agentListProvider.notifier).refresh();

      expect(container.read(agentListProvider).valueOrNull, hasLength(2));
    });

    test('deleteAgent calls service then refreshes', () async {
      final fake = FakeAgentService()
        ..listResult = [buildAgent(id: 'a1')];

      final container = ProviderContainer(
        overrides: [agentServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      await container.read(agentListProvider.future);
      await container.read(agentListProvider.notifier).deleteAgent('a1');

      expect(fake.lastDeletedId, 'a1');
    });
  });

  group('selectedAgentProvider', () {
    test('defaults to null', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(selectedAgentProvider), isNull);
    });

    test('can be set and read', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final agent = buildAgent(id: 'a1');
      container.read(selectedAgentProvider.notifier).state = agent;

      expect(container.read(selectedAgentProvider)?.id, 'a1');
    });
  });

  group('agentByIdProvider', () {
    test('fetches agent by ID from service', () async {
      final fake = FakeAgentService()
        ..getResult = buildAgent(id: 'a1', name: 'My Bot');

      final container = ProviderContainer(
        overrides: [agentServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final agent = await container.read(agentByIdProvider('a1').future);
      expect(agent?.name, 'My Bot');
      expect(fake.lastGetId, 'a1');
    });
  });
}
