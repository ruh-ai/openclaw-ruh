import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:ruh_app/providers/settings_provider.dart';

void main() {
  group('notificationsEnabledProvider', () {
    test('defaults to true when no preference set', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final enabled = await container.read(
        notificationsEnabledProvider.future,
      );
      expect(enabled, isTrue);
    });

    test('setEnabled persists and updates state', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container.read(notificationsEnabledProvider.future);
      await container
          .read(notificationsEnabledProvider.notifier)
          .setEnabled(false);

      final state = container.read(notificationsEnabledProvider);
      expect(state.valueOrNull, isFalse);

      // Verify persistence
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('ruh_notifications_enabled'), isFalse);
    });
  });
}
