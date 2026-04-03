import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ruh_app/providers/theme_provider.dart';

void main() {
  group('ThemeModeNotifier', () {
    test('defaults to ThemeMode.light when no preference saved', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final future = container.read(themeModeProvider.future);
      final mode = await future;

      expect(mode, ThemeMode.light);
    });

    test('restores ThemeMode.dark from saved preference', () async {
      SharedPreferences.setMockInitialValues({'ruh_theme_mode': 'dark'});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final mode = await container.read(themeModeProvider.future);

      expect(mode, ThemeMode.dark);
    });

    test('restores ThemeMode.system from saved preference', () async {
      SharedPreferences.setMockInitialValues({'ruh_theme_mode': 'system'});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final mode = await container.read(themeModeProvider.future);

      expect(mode, ThemeMode.system);
    });

    test('setThemeMode persists and updates state', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      // Wait for initial build to complete.
      await container.read(themeModeProvider.future);

      final notifier = container.read(themeModeProvider.notifier);
      await notifier.setThemeMode(ThemeMode.dark);

      final mode = await container.read(themeModeProvider.future);
      expect(mode, ThemeMode.dark);

      // Verify persistence.
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('ruh_theme_mode'), 'dark');
    });

    test('setThemeMode to system persists correctly', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container.read(themeModeProvider.future);

      final notifier = container.read(themeModeProvider.notifier);
      await notifier.setThemeMode(ThemeMode.system);

      final mode = await container.read(themeModeProvider.future);
      expect(mode, ThemeMode.system);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('ruh_theme_mode'), 'system');
    });

    test('defaults to light for unknown saved value', () async {
      SharedPreferences.setMockInitialValues({'ruh_theme_mode': 'invalid'});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final mode = await container.read(themeModeProvider.future);

      expect(mode, ThemeMode.light);
    });
  });
}
