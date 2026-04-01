import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Re-exports the theme mode provider from the canonical theme_provider.dart
/// for settings-related consumers.
///
/// The actual implementation lives in [theme_provider.dart] as
/// [ThemeModeNotifier]. This file provides a convenience alias and any
/// future non-theme settings.
export 'theme_provider.dart' show themeModeProvider, ThemeModeNotifier;

// ---------------------------------------------------------------------------
// Additional app-level settings can be added here.
// ---------------------------------------------------------------------------

const String _kNotificationsEnabledKey = 'ruh_notifications_enabled';

/// Whether push notifications are enabled (persisted).
final notificationsEnabledProvider =
    AsyncNotifierProvider<NotificationsEnabledNotifier, bool>(
      NotificationsEnabledNotifier.new,
    );

class NotificationsEnabledNotifier extends AsyncNotifier<bool> {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kNotificationsEnabledKey) ?? true;
  }

  Future<void> setEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kNotificationsEnabledKey, enabled);
    state = AsyncData(enabled);
  }
}
