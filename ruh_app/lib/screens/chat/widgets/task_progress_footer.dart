import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';

/// Compact progress bar shown between messages and input during agent execution.
///
/// Shows: pulsing status dot + status text + current task label + step counter.
/// Matches the agent-builder-ui TaskProgressFooter pattern.
class TaskProgressFooter extends StatefulWidget {
  final ChatState chatState;

  const TaskProgressFooter({super.key, required this.chatState});

  @override
  State<TaskProgressFooter> createState() => _TaskProgressFooterState();
}

class _TaskProgressFooterState extends State<TaskProgressFooter>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.chatState.isStreaming) return const SizedBox.shrink();

    final allSteps = widget.chatState.messages.expand((m) => m.steps).toList();
    final doneSteps = allSteps.where((s) => s.status == 'done').length;
    final totalSteps = allSteps.length;
    final activeTool = widget.chatState.activeToolName;

    // Status text
    String statusText;
    if (activeTool != null) {
      statusText = 'Running: $activeTool';
    } else if (allSteps.isNotEmpty && allSteps.last.kind == 'thinking') {
      statusText = 'Thinking...';
    } else {
      statusText = 'Working...';
    }

    // Current task label from latest active step
    String? taskLabel;
    for (final step in allSteps.reversed) {
      if (step.status == 'active') {
        taskLabel = step.label;
        break;
      }
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: const Border(top: BorderSide(color: RuhTheme.borderMuted)),
      ),
      child: Row(
        children: [
          // Pulsing status dot
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, _) {
              return Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: RuhTheme.primary.withValues(
                    alpha: 0.5 + 0.5 * _pulseController.value,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: RuhTheme.primary.withValues(
                        alpha: 0.2 * _pulseController.value,
                      ),
                      blurRadius: 4,
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(width: 8),

          // Status text
          Text(
            statusText,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: RuhTheme.textSecondary,
            ),
          ),

          // Task label (truncated)
          if (taskLabel != null) ...[
            const SizedBox(width: 8),
            Container(
              width: 3,
              height: 3,
              decoration: const BoxDecoration(
                color: RuhTheme.textTertiary,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                taskLabel,
                style: const TextStyle(
                  fontSize: 11,
                  color: RuhTheme.textTertiary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ] else
            const Spacer(),

          // Step counter pill
          if (totalSteps > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: RuhTheme.accentLight,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$doneSteps/$totalSteps',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: RuhTheme.primary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
