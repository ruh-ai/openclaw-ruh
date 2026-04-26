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

    const linux = LinuxInitializationSettings(
      defaultActionName: 'Open Ruh',
    );

    const settings = InitializationSettings(
      macOS: macOS,
      iOS: iOS,
      android: android,
      linux: linux,
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

  /// Callback invoked when a notification tap should navigate the app.
  /// Set this from the router layer so the notification service can trigger
  /// in-app navigation without depending on GoRouter directly.
  static void Function(String route)? onNavigate;

  /// Whether notifications are enabled by the user. Set from the settings
  /// provider. Defaults to true.
  bool enabled = true;

  /// Show a notification for task completion.
  Future<void> notifyTaskComplete(
    String agentName,
    String summary, {
    String? agentId,
  }) async {
    final truncated = summary.length > 100
        ? '${summary.substring(0, 100)}…'
        : summary;
    await _show(
      title: '✓ $agentName finished',
      body: truncated,
      payload: agentId != null ? 'chat:$agentId' : null,
    );
  }

  /// Show a notification for agent error.
  Future<void> notifyAgentError(
    String agentName,
    String error, {
    String? agentId,
  }) async {
    await _show(
      title: '⚠ $agentName error',
      body: error,
      payload: agentId != null ? 'chat:$agentId' : null,
    );
  }

  /// Show a notification for sandbox going offline.
  Future<void> notifySandboxDown(String sandboxName, {String? agentId}) async {
    await _show(
      title: 'Sandbox offline',
      body: '$sandboxName is no longer reachable',
      payload: agentId != null ? 'chat:$agentId' : null,
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  int _nextId = 0;

  Future<void> _show({
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_initialized || !enabled) {
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

    const linuxDetails = LinuxNotificationDetails();

    const details = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
      linux: linuxDetails,
    );

    try {
      await _plugin.show(_nextId++, title, body, details, payload: payload);
    } catch (e, st) {
      Log.e('Notifications', 'Failed to show notification', e, st);
    }
  }

  void _onNotificationTapped(NotificationResponse response) {
    final payload = response.payload;
    Log.d('Notifications', 'Tapped notification: $payload');

    if (payload == null || payload.isEmpty) return;

    // Payload format: "chat:<agentId>"
    if (payload.startsWith('chat:')) {
      final agentId = payload.substring(5);
      if (agentId.isNotEmpty) {
        onNavigate?.call('/chat/$agentId');
      }
    }
  }
}
