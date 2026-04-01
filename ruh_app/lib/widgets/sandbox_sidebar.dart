import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../config/theme.dart';
import '../models/sandbox.dart';

/// Sidebar widget for browsing and selecting sandboxes (agents).
///
/// Displays a list of [SandboxRecord]s with status dots, names,
/// and truncated IDs. Supports selection, creation, and deletion.
class SandboxSidebar extends StatelessWidget {
  final List<SandboxRecord> sandboxes;
  final String? selectedSandboxId;
  final ValueChanged<SandboxRecord> onSelect;
  final VoidCallback? onCreateNew;
  final ValueChanged<SandboxRecord>? onDelete;

  const SandboxSidebar({
    super.key,
    required this.sandboxes,
    this.selectedSandboxId,
    required this.onSelect,
    this.onCreateNew,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: 260,
      decoration: BoxDecoration(
        color: RuhTheme.sidebar,
        border: Border(
          right: BorderSide(color: theme.dividerColor),
        ),
      ),
      child: Column(
        children: [
          // ── Header ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
            child: Row(
              children: [
                Text(
                  'Agents',
                  style: theme.textTheme.headlineMedium,
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(LucideIcons.plus, size: 18),
                  tooltip: 'Create new agent',
                  onPressed: onCreateNew,
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // ── Sandbox list ──
          Expanded(
            child: sandboxes.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'No agents yet.\nTap + to create one.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    itemCount: sandboxes.length,
                    itemBuilder: (context, index) {
                      final sandbox = sandboxes[index];
                      final isSelected =
                          sandbox.sandboxId == selectedSandboxId;
                      return _SandboxTile(
                        sandbox: sandbox,
                        isSelected: isSelected,
                        onTap: () => onSelect(sandbox),
                        onDelete: onDelete != null
                            ? () => onDelete!(sandbox)
                            : null,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _SandboxTile extends StatefulWidget {
  final SandboxRecord sandbox;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  const _SandboxTile({
    required this.sandbox,
    required this.isSelected,
    required this.onTap,
    this.onDelete,
  });

  @override
  State<_SandboxTile> createState() => _SandboxTileState();
}

class _SandboxTileState extends State<_SandboxTile> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor =
        widget.sandbox.approved ? RuhTheme.success : RuhTheme.warning;
    final idPreview = widget.sandbox.sandboxId.length >= 8
        ? widget.sandbox.sandboxId.substring(0, 8)
        : widget.sandbox.sandboxId;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onLongPress: widget.onDelete,
        child: InkWell(
          onTap: widget.onTap,
          child: Container(
            decoration: BoxDecoration(
              border: Border(
                left: BorderSide(
                  color: widget.isSelected
                      ? RuhTheme.primary
                      : Colors.transparent,
                  width: 3,
                ),
              ),
              color: widget.isSelected
                  ? RuhTheme.accentLight
                  : _hovering
                      ? RuhTheme.lightPurple
                      : Colors.transparent,
            ),
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                // Status dot
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),

                // Name + ID
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.sandbox.sandboxName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: widget.isSelected
                              ? FontWeight.w600
                              : FontWeight.normal,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        idPreview,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontFamily: 'monospace',
                          color: RuhTheme.textTertiary,
                        ),
                      ),
                    ],
                  ),
                ),

                // Delete button (hover-reveal)
                if (_hovering && widget.onDelete != null)
                  IconButton(
                    icon: Icon(
                      LucideIcons.trash2,
                      size: 14,
                      color: RuhTheme.textTertiary,
                    ),
                    onPressed: widget.onDelete,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 28,
                      minHeight: 28,
                    ),
                    tooltip: 'Delete',
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
