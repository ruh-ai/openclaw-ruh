import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'logger.dart';

/// Singleton push-notification service wrapping [FlutterLocalNotificationsPlugin].
///
/// Fires local notifications for agent task completions, errors, and sandbox
/// health changes. Call [init] once from `main()` before using any `notify*`
/// method.
class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  /// Initialize the notification plugin. Call once from `main()`.
  Future<void> init() async {
    if (_initialized) return;

    const macOS = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const iOS = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');

    const settings = InitializationSettings(
      macOS: macOS,
      iOS: iOS,
      android: android,
    );

    try {
      await _plugin.initialize(
        settings,
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );
      _initialized = true;
      Log.i('Notifications', 'Notification service initialized');
    } catch (e, st) {
      Log.e('Notifications', 'Failed to initialize notifications', e, st);
    }
  }

  // ---------------------------------------------------------------------------
  // Public notification methods
  // ---------------------------------------------------------------------------

  /// Show a notification for task completion.
  Future<void> notifyTaskComplete(String agentName, String summary) async {
    final truncated = summary.length > 100
        ? '${summary.substring(0, 100)}…'
        : summary;
    await _show(title: '✓ $agentName finished', body: truncated);
  }

  /// Show a notification for agent error.
  Future<void> notifyAgentError(String agentName, String error) async {
    await _show(title: '⚠ $agentName error', body: error);
  }

  /// Show a notification for sandbox going offline.
  Future<void> notifySandboxDown(String sandboxName) async {
    await _show(
      title: 'Sandbox offline',
      body: '$sandboxName is no longer reachable',
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  int _nextId = 0;

  Future<void> _show({required String title, required String body}) async {
    if (!_initialized) {
      Log.w('Notifications', 'Notification service not initialized, skipping');
      return;
    }

    const androidDetails = AndroidNotificationDetails(
      'ruh_agent_events',
      'Agent Events',
      channelDescription: 'Notifications for agent tasks, errors, and health',
      importance: Importance.high,
      priority: Priority.high,
    );

    const darwinDetails = DarwinNotificationDetails();

    const details = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
    );

    try {
      await _plugin.show(_nextId++, title, body, details);
    } catch (e, st) {
      Log.e('Notifications', 'Failed to show notification', e, st);
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    if (kDebugMode) {
      Log.d('Notifications', 'Tapped notification: ${response.payload}');
    }
  }
}
