import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/agent.dart';
import '../services/agent_service.dart';
import '../services/api_client.dart';
import '../services/logger.dart';

/// Provides the singleton [AgentService] instance.
final agentServiceProvider = Provider<AgentService>((ref) {
  return AgentService(client: ApiClient());
});

/// The currently selected agent (set when user taps an agent card).
final selectedAgentProvider = StateProvider<Agent?>((ref) => null);

/// The active sandbox ID for the selected agent.
final activeSandboxIdProvider = StateProvider<String?>((ref) => null);

/// Async provider that fetches and caches the full agent list.
final agentListProvider =
    AsyncNotifierProvider<AgentListNotifier, List<Agent>>(
  AgentListNotifier.new,
);

/// Notifier that manages the agent list state.
class AgentListNotifier extends AsyncNotifier<List<Agent>> {
  @override
  Future<List<Agent>> build() async {
    return _fetch();
  }

  Future<List<Agent>> _fetch() async {
    Log.i('AgentProvider', 'Fetching agent list...');
    final service = ref.read(agentServiceProvider);
    try {
      final agents = await service.listAgents();
      Log.i('AgentProvider', 'Loaded ${agents.length} agents');
      return agents;
    } catch (e, st) {
      Log.e('AgentProvider', 'Failed to fetch agents', e, st);
      rethrow;
    }
  }

  /// Re-fetch the agent list from the backend.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  /// Delete an agent by [id] and refresh the list.
  Future<void> deleteAgent(String id) async {
    final service = ref.read(agentServiceProvider);
    await service.deleteAgent(id);
    await refresh();
  }
}
