import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/sandbox.dart';
import 'agent_provider.dart';

/// Polling provider for sandbox health that also exposes manual recovery
/// actions to chat/runtime surfaces.
class SandboxHealthNotifier
    extends AutoDisposeFamilyAsyncNotifier<SandboxHealth?, String> {
  Timer? _pollTimer;
  late String _sandboxId;

  @override
  Future<SandboxHealth?> build(String sandboxId) async {
    _sandboxId = sandboxId;
    ref.onDispose(() => _pollTimer?.cancel());
    _startPolling();
    return _fetch();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      unawaited(refreshStatus(silent: true));
    });
  }

  Future<SandboxHealth?> _fetch() async {
    final service = ref.read(agentServiceProvider);
    try {
      return await service.getSandboxHealth(_sandboxId);
    } catch (_) {
      return null;
    }
  }

  /// Refresh sandbox health on demand.
  Future<void> refreshStatus({bool silent = false}) async {
    final previous = state.valueOrNull;
    if (!silent && previous == null) {
      state = const AsyncLoading();
    }
    final next = await _fetch();
    state = AsyncData(next);
  }

  /// Restart the runtime and then refresh health.
  Future<void> restartRuntime() async {
    final service = ref.read(agentServiceProvider);
    await service.restartSandbox(_sandboxId);
    await refreshStatus(silent: true);
  }
}

/// Async provider that polls sandbox health for a given sandbox ID.
final sandboxHealthProvider = AsyncNotifierProvider.autoDispose
    .family<SandboxHealthNotifier, SandboxHealth?, String>(
      SandboxHealthNotifier.new,
    );
