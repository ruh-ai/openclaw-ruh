import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';

/// Compact task plan widget rendered inside assistant message bubbles.
///
/// Shows a checklist of tasks with status indicators:
/// - Green check = done
/// - Pulsing purple dot = active
/// - Empty circle = pending
///
/// Includes a progress bar and completion count. Historical messages
/// can collapse the plan via a show/hide toggle.
class TaskPlanWidget extends StatefulWidget {
  final TaskPlan plan;
  final bool initiallyCollapsed;

  const TaskPlanWidget({
    super.key,
    required this.plan,
    this.initiallyCollapsed = false,
  });

  @override
  State<TaskPlanWidget> createState() => _TaskPlanWidgetState();
}

class _TaskPlanWidgetState extends State<TaskPlanWidget> {
  late bool _collapsed;

  @override
  void initState() {
    super.initState();
    _collapsed = widget.initiallyCollapsed;
  }

  @override
  Widget build(BuildContext context) {
    final plan = widget.plan;
    final completed = plan.completedTasks;
    final total = plan.totalTasks;
    final progress = total > 0 ? completed / total : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RuhTheme.accentLight.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
        border: Border.all(color: RuhTheme.borderMuted),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header row with toggle
          GestureDetector(
            onTap: () => setState(() => _collapsed = !_collapsed),
            behavior: HitTestBehavior.opaque,
            child: Row(
              children: [
                const Icon(
                  LucideIcons.listChecks,
                  size: 14,
                  color: RuhTheme.primary,
                ),
                const SizedBox(width: 6),
                Text(
                  'Task Plan',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: RuhTheme.textSecondary,
                  ),
                ),
                const Spacer(),
                Text(
                  '$completed of $total tasks complete',
                  style: const TextStyle(
                    fontSize: 11,
                    color: RuhTheme.textTertiary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  _collapsed ? LucideIcons.chevronDown : LucideIcons.chevronUp,
                  size: 14,
                  color: RuhTheme.textTertiary,
                ),
              ],
            ),
          ),

          // Collapsed: just show progress bar
          if (_collapsed) ...[
            const SizedBox(height: 8),
            _ProgressBar(progress: progress),
          ],

          // Expanded: show items + progress bar
          if (!_collapsed) ...[
            const SizedBox(height: 10),

            // Task items
            for (var i = 0; i < plan.items.length; i++) ...[
              _TaskItemRow(item: plan.items[i]),
              // Children
              for (final child in plan.items[i].children)
                Padding(
                  padding: const EdgeInsets.only(left: 24),
                  child: _TaskItemRow(item: child, isChild: true),
                ),
            ],

            const SizedBox(height: 10),

            // Progress bar
            _ProgressBar(progress: progress),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Task item row
// ---------------------------------------------------------------------------

class _TaskItemRow extends StatelessWidget {
  final TaskPlanItem item;
  final bool isChild;

  const _TaskItemRow({required this.item, this.isChild = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 18,
            height: 18,
            child: _StatusIcon(status: item.status),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              item.label,
              style: TextStyle(
                fontSize: isChild ? 12 : 13,
                color: item.status == 'done'
                    ? RuhTheme.textTertiary
                    : RuhTheme.textPrimary,
                decoration: item.status == 'done'
                    ? TextDecoration.lineThrough
                    : null,
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Status icon (done / active / pending)
// ---------------------------------------------------------------------------

class _StatusIcon extends StatefulWidget {
  final String status;

  const _StatusIcon({required this.status});

  @override
  State<_StatusIcon> createState() => _StatusIconState();
}

class _StatusIconState extends State<_StatusIcon>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void initState() {
    super.initState();
    _setupAnimation();
  }

  @override
  void didUpdateWidget(_StatusIcon old) {
    super.didUpdateWidget(old);
    if (old.status != widget.status) {
      _controller?.dispose();
      _controller = null;
      _setupAnimation();
    }
  }

  void _setupAnimation() {
    if (widget.status == 'active') {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1500),
      )..repeat();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    switch (widget.status) {
      case 'done':
        return Container(
          width: 18,
          height: 18,
          decoration: const BoxDecoration(
            color: RuhTheme.success,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check, size: 12, color: Colors.white),
        );

      case 'active':
        return AnimatedBuilder(
          animation: _controller!,
          builder: (context, _) {
            return Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: RuhTheme.primary.withValues(
                    alpha: 0.3 + 0.4 * _controller!.value,
                  ),
                  width: 2,
                ),
              ),
              child: Center(
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: RuhTheme.primary,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: RuhTheme.primary.withValues(
                          alpha: 0.3 * _controller!.value,
                        ),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );

      default: // pending
        return Container(
          width: 18,
          height: 18,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: RuhTheme.borderDefault, width: 1.5),
          ),
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

class _ProgressBar extends StatelessWidget {
  final double progress;

  const _ProgressBar({required this.progress});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: SizedBox(
        height: 4,
        child: LinearProgressIndicator(
          value: progress,
          backgroundColor: RuhTheme.borderDefault,
          valueColor: const AlwaysStoppedAnimation<Color>(RuhTheme.success),
        ),
      ),
    );
  }
}
