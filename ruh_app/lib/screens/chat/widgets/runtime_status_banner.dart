import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../models/sandbox.dart';
import '../../../providers/sandbox_health_provider.dart';
import '../../../utils/error_formatter.dart';

class RuntimeStatusSnapshot {
  final String label;
  final Color color;
  final IconData icon;
  final String title;
  final String message;
  final bool showBanner;

  const RuntimeStatusSnapshot({
    required this.label,
    required this.color,
    required this.icon,
    required this.title,
    required this.message,
    required this.showBanner,
  });
}

RuntimeStatusSnapshot deriveRuntimeStatusSnapshot({
  required AsyncValue<SandboxHealth?> healthAsync,
  String? chatError,
}) {
  final health = healthAsync.valueOrNull;
  final trimmedChatError = chatError?.trim();

  if (healthAsync.isLoading && health == null && (trimmedChatError == null || trimmedChatError.isEmpty)) {
    return const RuntimeStatusSnapshot(
      label: 'Checking runtime',
      color: RuhTheme.textTertiary,
      icon: LucideIcons.loader2,
      title: 'Checking runtime',
      message: 'Fetching the current sandbox status.',
      showBanner: false,
    );
  }

  if (trimmedChatError != null && trimmedChatError.isNotEmpty) {
    if (health?.isHealthy == true) {
      return RuntimeStatusSnapshot(
        label: 'Healthy',
        color: RuhTheme.success,
        icon: LucideIcons.messageSquare,
        title: 'Chat connection failed',
        message: trimmedChatError,
        showBanner: true,
      );
    }

    if (health?.isRunning == true) {
      return RuntimeStatusSnapshot(
        label: 'Gateway unhealthy',
        color: RuhTheme.warning,
        icon: LucideIcons.wifiOff,
        title: 'Runtime degraded',
        message:
            'The sandbox is running, but the gateway is unhealthy. Browser, files, and chat may be stale.\n\n$trimmedChatError',
        showBanner: true,
      );
    }

    return RuntimeStatusSnapshot(
      label: 'Runtime unreachable',
      color: RuhTheme.error,
      icon: LucideIcons.alertTriangle,
      title: 'Could not connect to agent',
      message: trimmedChatError,
      showBanner: true,
    );
  }

  if (health == null) {
    return const RuntimeStatusSnapshot(
      label: 'Runtime unavailable',
      color: RuhTheme.textTertiary,
      icon: LucideIcons.serverCrash,
      title: 'Runtime status unavailable',
      message:
          'We could not read the current sandbox status. Refresh the status or restart the runtime if this keeps happening.',
      showBanner: true,
    );
  }

  if (health.isHealthy) {
    return const RuntimeStatusSnapshot(
      label: 'Healthy',
      color: RuhTheme.success,
      icon: LucideIcons.badgeCheck,
      title: 'Healthy',
      message: '',
      showBanner: false,
    );
  }

  if (health.isRunning) {
    return const RuntimeStatusSnapshot(
      label: 'Gateway unhealthy',
      color: RuhTheme.warning,
      icon: LucideIcons.wifiOff,
      title: 'Runtime degraded',
      message:
          'The sandbox is still running, but the gateway is unhealthy. Refresh the runtime status or restart the runtime if Browser, Files, or Chat stay stale.',
      showBanner: true,
    );
  }

  return const RuntimeStatusSnapshot(
    label: 'Runtime unreachable',
    color: RuhTheme.error,
    icon: LucideIcons.alertTriangle,
    title: 'Runtime unreachable',
    message:
        'The sandbox is not currently reachable. Refresh the runtime status or restart the runtime to recover.',
    showBanner: true,
  );
}

class RuntimeStatusBanner extends StatelessWidget {
  final RuntimeStatusSnapshot snapshot;
  final VoidCallback? onRetryChat;
  final VoidCallback? onRefreshStatus;
  final VoidCallback? onRestartRuntime;
  final bool busy;

  const RuntimeStatusBanner({
    super.key,
    required this.snapshot,
    this.onRetryChat,
    this.onRefreshStatus,
    this.onRestartRuntime,
    this.busy = false,
  });

  @override
  Widget build(BuildContext context) {
    if (!snapshot.showBanner) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: snapshot.color.withValues(alpha: 0.10),
        border: Border.all(color: snapshot.color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(snapshot.icon, size: 16, color: snapshot.color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  snapshot.title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: snapshot.color,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            snapshot.message,
            style: const TextStyle(
              fontSize: 12,
              color: RuhTheme.textSecondary,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (onRetryChat != null)
                TextButton.icon(
                  onPressed: busy ? null : onRetryChat,
                  icon: const Icon(LucideIcons.refreshCcw, size: 14),
                  label: const Text('Retry chat'),
                ),
              if (onRefreshStatus != null)
                TextButton.icon(
                  onPressed: busy ? null : onRefreshStatus,
                  icon: const Icon(LucideIcons.activity, size: 14),
                  label: const Text('Refresh status'),
                ),
              if (onRestartRuntime != null)
                OutlinedButton.icon(
                  onPressed: busy ? null : onRestartRuntime,
                  icon: busy
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(LucideIcons.refreshCw, size: 14),
                  label: const Text('Restart runtime'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class ChatRuntimeStatusBanner extends ConsumerStatefulWidget {
  final String sandboxId;
  final String? chatError;
  final VoidCallback? onRetryChat;

  const ChatRuntimeStatusBanner({
    super.key,
    required this.sandboxId,
    this.chatError,
    this.onRetryChat,
  });

  @override
  ConsumerState<ChatRuntimeStatusBanner> createState() =>
      _ChatRuntimeStatusBannerState();
}

class _ChatRuntimeStatusBannerState
    extends ConsumerState<ChatRuntimeStatusBanner> {
  bool _busy = false;

  Future<void> _restartRuntime() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(sandboxHealthProvider(widget.sandboxId).notifier)
          .restartRuntime();
      widget.onRetryChat?.call();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Runtime restart initiated')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Restart failed: ${formatError(e)}')),
      );
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _refreshStatus() async {
    await ref
        .read(sandboxHealthProvider(widget.sandboxId).notifier)
        .refreshStatus();
  }

  @override
  Widget build(BuildContext context) {
    final healthAsync = ref.watch(sandboxHealthProvider(widget.sandboxId));
    final snapshot = deriveRuntimeStatusSnapshot(
      healthAsync: healthAsync,
      chatError: widget.chatError,
    );

    return RuntimeStatusBanner(
      snapshot: snapshot,
      busy: _busy,
      onRetryChat: widget.onRetryChat,
      onRefreshStatus: _refreshStatus,
      onRestartRuntime: _restartRuntime,
    );
  }
}
