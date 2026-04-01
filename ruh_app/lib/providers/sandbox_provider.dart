import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/sandbox.dart';
import '../services/api_client.dart';
import '../services/sandbox_service.dart';

final sandboxServiceProvider = Provider<SandboxService>((ref) {
  return SandboxService(client: ApiClient());
});

final sandboxListProvider =
    AsyncNotifierProvider<SandboxListNotifier, List<SandboxRecord>>(
      SandboxListNotifier.new,
    );

class SandboxListNotifier extends AsyncNotifier<List<SandboxRecord>> {
  @override
  Future<List<SandboxRecord>> build() async {
    return _fetch();
  }

  Future<List<SandboxRecord>> _fetch() async {
    final service = ref.read(sandboxServiceProvider);
    return service.listSandboxes();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }

  Future<void> deleteSandbox(String sandboxId) async {
    final service = ref.read(sandboxServiceProvider);
    await service.deleteSandbox(sandboxId);
    await refresh();
  }
}
