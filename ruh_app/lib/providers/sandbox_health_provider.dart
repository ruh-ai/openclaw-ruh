import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/sandbox.dart';
import '../services/agent_service.dart';
import '../services/api_client.dart';

/// Provider for agent service singleton.
final _agentServiceProvider = Provider<AgentService>((ref) {
  return AgentService(client: ApiClient());
});

/// Async provider that fetches sandbox health for a given sandbox ID.
final sandboxHealthProvider = FutureProvider.family
    .autoDispose<SandboxHealth?, String>((ref, sandboxId) async {
      final service = ref.read(_agentServiceProvider);
      try {
        return await service.getSandboxHealth(sandboxId);
      } catch (_) {
        return null;
      }
    });
