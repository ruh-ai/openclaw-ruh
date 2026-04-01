import 'dart:async';

import 'api_client.dart';
import 'logger.dart';
import 'notification_service.dart';

/// Background health monitor that polls sandbox status and fires notifications
/// when a sandbox goes offline or recovers.
///
/// Usage:
/// ```dart
/// final monitor = HealthMonitor();
/// monitor.start(['sandbox-abc', 'sandbox-def']);
/// // later…
/// monitor.stop();
/// ```
class HealthMonitor {
  HealthMonitor({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;
  Timer? _timer;

  /// Tracks the last known health state per sandbox.
  /// `true` = healthy, `false` = unhealthy/unreachable.
  final Map<String, bool> _lastHealthState = {};

  /// Start polling every 30 seconds.
  void start(List<String> sandboxIds) {
    _timer?.cancel();
    // Seed all sandbox IDs as healthy (assume healthy until proven otherwise).
    for (final id in sandboxIds) {
      _lastHealthState.putIfAbsent(id, () => true);
    }
    _timer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _checkAll(sandboxIds),
    );
    Log.i('HealthMonitor', 'Started polling ${sandboxIds.length} sandbox(es)');
  }

  /// Stop polling.
  void stop() {
    _timer?.cancel();
    _timer = null;
    Log.i('HealthMonitor', 'Stopped polling');
  }

  /// Update the list of monitored sandboxes without restarting the timer.
  void updateSandboxIds(List<String> sandboxIds) {
    // Remove stale entries
    _lastHealthState.removeWhere((id, _) => !sandboxIds.contains(id));
    // Add new entries
    for (final id in sandboxIds) {
      _lastHealthState.putIfAbsent(id, () => true);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  Future<void> _checkAll(List<String> sandboxIds) async {
    for (final id in sandboxIds) {
      await _checkOne(id);
    }
  }

  Future<void> _checkOne(String sandboxId) async {
    final wasHealthy = _lastHealthState[sandboxId] ?? true;

    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/sandboxes/$sandboxId/status',
      );
      final data = response.data;
      final status = data?['status'] as String? ?? 'unknown';
      final isHealthy = status == 'running' || status == 'healthy';

      _lastHealthState[sandboxId] = isHealthy;

      if (wasHealthy && !isHealthy) {
        Log.w(
          'HealthMonitor',
          'Sandbox $sandboxId went offline (status: $status)',
        );
        await NotificationService().notifySandboxDown(sandboxId);
      } else if (!wasHealthy && isHealthy) {
        Log.i('HealthMonitor', 'Sandbox $sandboxId recovered');
      }
    } catch (e) {
      // Backend unreachable or sandbox not found — treat as unhealthy.
      _lastHealthState[sandboxId] = false;

      if (wasHealthy) {
        Log.w('HealthMonitor', 'Sandbox $sandboxId unreachable: $e');
        await NotificationService().notifySandboxDown(sandboxId);
      }
      // If it was already unhealthy, just skip — don't spam notifications.
    }
  }
}
