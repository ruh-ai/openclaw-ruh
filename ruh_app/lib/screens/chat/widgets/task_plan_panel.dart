import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';

/// Manus-style task plan panel showing step-by-step progress.
///
/// Parsed from markdown checkboxes in assistant messages.
/// Done items get a green checkmark, active item gets a pulsing dot,
/// pending items get a gray circle.
class TaskPlanPanel extends StatelessWidget {
  final TaskPlan plan;

  const TaskPlanPanel({super.key, required this.plan});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: RuhTheme.accentLight.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
        border: Border.all(color: RuhTheme.borderMuted),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
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
                '${plan.completedTasks}/${plan.totalTasks}',
                style: const TextStyle(
                  fontSize: 11,
                  color: RuhTheme.textTertiary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Items
          for (var i = 0; i < plan.items.length; i++) ...[
            _PlanItemRow(
              item: plan.items[i],
              isLast: i == plan.items.length - 1,
            ),
            // Children
            for (var j = 0; j < plan.items[i].children.length; j++)
              Padding(
                padding: const EdgeInsets.only(left: 24),
                child: _PlanItemRow(
                  item: plan.items[i].children[j],
                  isLast: j == plan.items[i].children.length - 1,
                  isChild: true,
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _PlanItemRow extends StatelessWidget {
  final TaskPlanItem item;
  final bool isLast;
  final bool isChild;

  const _PlanItemRow({
    required this.item,
    this.isLast = false,
    this.isChild = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status indicator
          SizedBox(
            width: 18,
            height: 18,
            child: _StatusBadge(status: item.status),
          ),
          const SizedBox(width: 8),
          // Label
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

class _StatusBadge extends StatefulWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  State<_StatusBadge> createState() => _StatusBadgeState();
}

class _StatusBadgeState extends State<_StatusBadge>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void initState() {
    super.initState();
    if (widget.status == 'active') {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1500),
      )..repeat();
    }
  }

  @override
  void didUpdateWidget(_StatusBadge old) {
    super.didUpdateWidget(old);
    if (widget.status == 'active' && _controller == null) {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1500),
      )..repeat();
    } else if (widget.status != 'active') {
      _controller?.dispose();
      _controller = null;
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
