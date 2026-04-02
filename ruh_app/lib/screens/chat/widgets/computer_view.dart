import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';
import 'agent_config_panel.dart';
import 'browser_panel.dart';
import 'code_panel.dart';
import 'terminal_panel.dart';

/// Tab definition for the Agent's Computer panel.
class _ComputerTab {
  final String id;
  final String label;
  final IconData icon;

  const _ComputerTab({
    required this.id,
    required this.label,
    required this.icon,
  });
}

const _tabs = [
  _ComputerTab(id: 'terminal', label: 'Terminal', icon: LucideIcons.terminal),
  _ComputerTab(id: 'files', label: 'Files', icon: LucideIcons.folderOpen),
  _ComputerTab(id: 'browser', label: 'Browser', icon: LucideIcons.globe),
  _ComputerTab(id: 'config', label: 'Agent Config', icon: LucideIcons.sliders),
];

/// Tool name to tab auto-switch mapping.
const _toolTabMapping = {
  // Terminal tools
  'bash': 'terminal',
  'bash_tool': 'terminal',
  'exec': 'terminal',
  'shell': 'terminal',
  'terminal': 'terminal',
  // Code tools
  'file_write': 'files',
  'write_file': 'files',
  'create_file': 'files',
  'code_editor': 'files',
  'file_read': 'files',
  // Browser tools
  'browser_navigate': 'browser',
  'browser_click': 'browser',
  'browser_input': 'browser',
  'browser_scroll': 'browser',
  'web_search': 'browser',
};

/// Right-side "Agent's Computer" panel in the Manus-style split layout.
///
/// Features:
/// - Header with live status dot, "AGENT'S COMPUTER" label, progress dots, task counter
/// - Pill-style tab bar: Terminal | Code | Browser
/// - Auto-switches tab based on active tool (500ms debounce)
/// - Manual tab click overrides auto-switch for 5 seconds
/// - Progress dots: green=done, pulsing purple=active, gray=pending
class ComputerView extends StatefulWidget {
  final String agentId;
  final String sandboxId;
  final ChatState chatState;
  final String initialTab;
  final bool isFullscreen;
  final VoidCallback? onToggleFullscreen;

  const ComputerView({
    super.key,
    required this.agentId,
    required this.sandboxId,
    required this.chatState,
    this.initialTab = 'terminal',
    this.isFullscreen = false,
    this.onToggleFullscreen,
  });

  @override
  State<ComputerView> createState() => _ComputerViewState();
}

class _ComputerViewState extends State<ComputerView> {
  late String _activeTab;
  DateTime? _lastManualSwitch;
  Timer? _autoSwitchTimer;

  @override
  void initState() {
    super.initState();
    _activeTab = widget.initialTab;
    if (widget.initialTab != 'terminal') {
      _lastManualSwitch = DateTime.now();
    }
  }

  @override
  void didUpdateWidget(ComputerView old) {
    super.didUpdateWidget(old);
    if (old.initialTab != widget.initialTab && widget.initialTab != _activeTab) {
      _activeTab = widget.initialTab;
      if (widget.initialTab != 'terminal') {
        _lastManualSwitch = DateTime.now();
      }
    }
    final tool = widget.chatState.activeToolName;
    if (tool != null && tool != old.chatState.activeToolName) {
      final targetTab = _toolTabMapping[tool];
      if (targetTab != null) {
        _autoSwitchTo(targetTab);
      }
    }
  }

  void _autoSwitchTo(String tabId) {
    // Respect manual selection for 5 seconds
    if (_lastManualSwitch != null &&
        DateTime.now().difference(_lastManualSwitch!).inSeconds < 5) {
      return;
    }
    _autoSwitchTimer?.cancel();
    _autoSwitchTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted) setState(() => _activeTab = tabId);
    });
  }

  void _manualSwitch(String tabId) {
    _lastManualSwitch = DateTime.now();
    setState(() => _activeTab = tabId);
  }

  @override
  void dispose() {
    _autoSwitchTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final allSteps = widget.chatState.messages.expand((m) => m.steps).toList();
    final completedSteps = allSteps.where((s) => s.status == 'done').length;
    final totalSteps = allSteps.length;

    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        border: Border(left: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        children: [
          // ── Header ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: theme.appBarTheme.backgroundColor,
              border: Border(bottom: BorderSide(color: theme.dividerColor)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top row: title + progress + fullscreen
                Row(
                  children: [
                    // Live status dot
                    _LiveDot(isActive: widget.chatState.isStreaming),
                    const SizedBox(width: 8),
                    Text(
                      "Agent's Computer",
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),

                    // Progress dots row
                    if (totalSteps > 0) ...[
                      _ProgressDots(steps: allSteps),
                      const SizedBox(width: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: RuhTheme.accentLight,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Task $completedSteps of $totalSteps',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: RuhTheme.primary,
                          ),
                        ),
                      ),
                    ],

                    if (widget.onToggleFullscreen != null) ...[
                      const SizedBox(width: 8),
                      IconButton(
                        icon: Icon(
                          widget.isFullscreen
                              ? LucideIcons.minimize2
                              : LucideIcons.maximize2,
                          size: 14,
                        ),
                        onPressed: widget.onToggleFullscreen,
                        tooltip: widget.isFullscreen
                            ? 'Exit fullscreen'
                            : 'Fullscreen',
                        iconSize: 14,
                        constraints: const BoxConstraints(
                          minWidth: 28,
                          minHeight: 28,
                        ),
                        padding: EdgeInsets.zero,
                        color: RuhTheme.textTertiary,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),

                // Tab pills row
                Row(
                  children: _tabs.map((tab) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: _TabPill(
                        tab: tab,
                        isActive: tab.id == _activeTab,
                        onTap: () => _manualSwitch(tab.id),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),

          // ── Tab content ─────────────────────────────────────────────
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: _buildTabContent(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_activeTab) {
      case 'terminal':
        return TerminalPanel(
          key: const ValueKey('terminal'),
          commands: widget.chatState.terminalCommands,
        );
      case 'files':
        return CodePanel(
          key: const ValueKey('files'),
          sandboxId: widget.sandboxId,
        );
      case 'browser':
        return BrowserPanel(
          key: const ValueKey('browser'),
          sandboxId: widget.sandboxId,
          browserState: widget.chatState.browserState,
          isAgentActive: widget.chatState.isStreaming,
        );
      case 'config':
        return AgentConfigPanel(
          key: const ValueKey('config'),
          agentId: widget.agentId,
          sandboxId: widget.sandboxId,
        );
      default:
        return const SizedBox.shrink();
    }
  }
}

// ---------------------------------------------------------------------------
// Live status dot with pulse animation
// ---------------------------------------------------------------------------

class _LiveDot extends StatefulWidget {
  final bool isActive;

  const _LiveDot({required this.isActive});

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    if (widget.isActive) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(_LiveDot old) {
    super.didUpdateWidget(old);
    if (widget.isActive && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.isActive && _controller.isAnimating) {
      _controller.stop();
      _controller.value = 0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isActive) {
      return Container(
        width: 8,
        height: 8,
        decoration: const BoxDecoration(
          color: RuhTheme.textTertiary,
          shape: BoxShape.circle,
        ),
      );
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: RuhTheme.success,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: RuhTheme.success.withValues(
                  alpha: 0.4 * _controller.value,
                ),
                blurRadius: 6,
                spreadRadius: 1,
              ),
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Progress dots (green=done, pulsing purple=active, gray=pending)
// ---------------------------------------------------------------------------

class _ProgressDots extends StatelessWidget {
  final List<ChatStep> steps;

  const _ProgressDots({required this.steps});

  @override
  Widget build(BuildContext context) {
    // Show at most 8 dots to avoid overflow
    final displaySteps = steps.length > 8
        ? steps.sublist(steps.length - 8)
        : steps;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: displaySteps.map((step) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: _StepDot(status: step.status),
        );
      }).toList(),
    );
  }
}

class _StepDot extends StatefulWidget {
  final String status;

  const _StepDot({required this.status});

  @override
  State<_StepDot> createState() => _StepDotState();
}

class _StepDotState extends State<_StepDot>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;

  @override
  void initState() {
    super.initState();
    if (widget.status == 'active') {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1200),
      )..repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(_StepDot old) {
    super.didUpdateWidget(old);
    if (widget.status == 'active' && _controller == null) {
      _controller = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1200),
      )..repeat(reverse: true);
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
    Color color;
    switch (widget.status) {
      case 'done':
        color = RuhTheme.success;
        break;
      case 'active':
        // Will be animated
        color = RuhTheme.primary;
        break;
      default:
        color = RuhTheme.borderDefault;
    }

    if (widget.status == 'active' && _controller != null) {
      return AnimatedBuilder(
        animation: _controller!,
        builder: (context, _) {
          return Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: RuhTheme.primary,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: RuhTheme.primary.withValues(
                    alpha: 0.4 * _controller!.value,
                  ),
                  blurRadius: 4,
                  spreadRadius: 1,
                ),
              ],
            ),
          );
        },
      );
    }

    return Container(
      width: 7,
      height: 7,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab pill button
// ---------------------------------------------------------------------------

class _TabPill extends StatelessWidget {
  final _ComputerTab tab;
  final bool isActive;
  final VoidCallback onTap;

  const _TabPill({
    required this.tab,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? RuhTheme.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive ? RuhTheme.primary : RuhTheme.borderDefault,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              tab.icon,
              size: 13,
              color: isActive ? Colors.white : RuhTheme.textTertiary,
            ),
            const SizedBox(width: 5),
            Text(
              tab.label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                color: isActive ? Colors.white : RuhTheme.textTertiary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
