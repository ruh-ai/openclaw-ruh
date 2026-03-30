import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';

/// Displays a single agent step (thinking or tool execution) with status.
class AgentStepWidget extends StatelessWidget {
  final ChatStep step;

  const AgentStepWidget({super.key, required this.step});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDone = step.status == 'done';
    final isTool = step.kind == 'tool';

    final IconData icon;
    final Color iconColor;

    if (isTool) {
      icon = isDone ? LucideIcons.checkCircle : LucideIcons.wrench;
      iconColor = isDone ? RuhTheme.success : RuhTheme.primary;
    } else {
      // thinking
      icon = isDone ? LucideIcons.checkCircle : LucideIcons.brain;
      iconColor = isDone ? RuhTheme.success : RuhTheme.secondary;
    }

    final String subtitle;
    if (isDone && step.elapsedMs != null) {
      subtitle = '${(step.elapsedMs! / 1000).toStringAsFixed(1)}s';
    } else if (!isDone) {
      subtitle = 'Running...';
    } else {
      subtitle = 'Done';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: isDone
            ? RuhTheme.success.withValues(alpha: 0.06)
            : RuhTheme.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
        border: Border.all(
          color: isDone
              ? RuhTheme.success.withValues(alpha: 0.15)
              : RuhTheme.borderMuted,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isDone)
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                color: iconColor,
              ),
            )
          else
            Icon(icon, size: 14, color: iconColor),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              step.label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w500,
                color: RuhTheme.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (step.toolName != null) ...[
            const SizedBox(width: 4),
            Text(
              step.toolName!,
              style: theme.textTheme.labelSmall?.copyWith(
                fontFamily: 'monospace',
                fontSize: 10,
                color: RuhTheme.textTertiary,
              ),
            ),
          ],
          const SizedBox(width: 6),
          Text(
            subtitle,
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 10,
              color: RuhTheme.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}
