import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ruh_app/providers/sandbox_provider.dart';

import '../test_support/fakes.dart';

void main() {
  group('sandboxListProvider', () {
    test('loads sandboxes from service', () async {
      final fake = FakeSandboxService()
        ..listResult = [buildSandboxRecord(sandboxId: 'sb-1')];

      final container = ProviderContainer(
        overrides: [sandboxServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final sandboxes = await container.read(sandboxListProvider.future);
      expect(sandboxes, hasLength(1));
      expect(sandboxes[0].sandboxId, 'sb-1');
    });

    test('refresh re-fetches', () async {
      final fake = FakeSandboxService()
        ..listResult = [buildSandboxRecord()];

      final container = ProviderContainer(
        overrides: [sandboxServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      await container.read(sandboxListProvider.future);
      expect(container.read(sandboxListProvider).valueOrNull, hasLength(1));

      fake.listResult = [];
      await container.read(sandboxListProvider.notifier).refresh();

      expect(container.read(sandboxListProvider).valueOrNull, hasLength(0));
    });

    test('deleteSandbox calls service then refreshes', () async {
      final fake = FakeSandboxService()
        ..listResult = [buildSandboxRecord(sandboxId: 'sb-1')];

      final container = ProviderContainer(
        overrides: [sandboxServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      await container.read(sandboxListProvider.future);
      await container.read(sandboxListProvider.notifier).deleteSandbox('sb-1');

      expect(fake.lastDeletedId, 'sb-1');
    });
  });
}
