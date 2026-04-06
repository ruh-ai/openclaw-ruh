import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../models/agent.dart';
import '../../providers/agent_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/sandbox_health_provider.dart';
import '../../utils/error_formatter.dart';
import '../../widgets/alive_animations.dart';
import 'tabs/tab_all_chats.dart';
import 'tabs/tab_mission_control.dart';
import 'widgets/chat_input.dart';
import 'widgets/computer_view.dart';
import 'widgets/message_bubble.dart';
import 'widgets/runtime_status_banner.dart';
import 'widgets/task_progress_footer.dart';

/// Manus-style split-pane chat interface.
///
/// Desktop (>900px): two-panel layout
///   - Left: chat messages + input (flex 2)
///   - Right: Agent's Computer with tabs (flex 3)
///
/// Mobile (<=900px): full-width chat, bottom sheet for Agent's Computer
class ChatScreen extends ConsumerStatefulWidget {
  final String agentId;
  final String initialComputerTab;

  const ChatScreen({
    super.key,
    required this.agentId,
    this.initialComputerTab = 'terminal',
  });

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  @override
  Widget build(BuildContext context) {
    var agent = ref.watch(selectedAgentProvider);
    final activeSandboxId = ref.watch(activeSandboxIdProvider);
    final theme = Theme.of(context);

    // Deep-link support: if agent is null, fetch by ID from the route param
    if (agent == null) {
      final agentAsync = ref.watch(agentByIdProvider(widget.agentId));
      return agentAsync.when(
        data: (fetchedAgent) {
          if (fetchedAgent != null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              ref.read(selectedAgentProvider.notifier).state = fetchedAgent;
              if (fetchedAgent.sandboxIds.isNotEmpty) {
                ref.read(activeSandboxIdProvider.notifier).state =
                    fetchedAgent.sandboxIds.first;
              }
            });
          }
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        },
        loading: () =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (err, _) => Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  LucideIcons.alertCircle,
                  size: 40,
                  color: RuhTheme.error,
                ),
                const SizedBox(height: 16),
                Text('Agent not found', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(
                  formatError(err),
                  style: const TextStyle(
                    color: RuhTheme.textTertiary,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () => context.go('/'),
                  icon: const Icon(LucideIcons.arrowLeft, size: IconSizes.sm),
                  label: const Text('Back to agents'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final chatAsync = activeSandboxId != null
        ? ref.watch(chatProvider(activeSandboxId))
        : null;
    final chatState = chatAsync?.valueOrNull;

    final screenWidth = MediaQuery.of(context).size.width;
    final isDesktop = screenWidth > 900;

    return Scaffold(
      body: Column(
        children: [
          // ── Header ────────────────────────────────────────────────
          _ChatHeader(
            agent: agent,
            activeSandboxId: activeSandboxId,
            onSandboxChanged: (id) {
              ref.read(activeSandboxIdProvider.notifier).state = id;
            },
            onBack: () {
              if (context.canPop()) {
                context.pop();
              } else {
                context.go('/');
              }
            },
            onOpenMenu: () =>
                _showSecondaryNav(context, agent, activeSandboxId),
          ),

          // ── Main content ──────────────────────────────────────────
          Expanded(
            child: isDesktop
                ? _DesktopLayout(
                    agentId: agent.id,
                    sandboxId: activeSandboxId,
                    chatState: chatState,
                    ref: ref,
                    initialComputerTab: widget.initialComputerTab,
                  )
                : _MobileLayout(
                    agentId: agent.id,
                    sandboxId: activeSandboxId,
                    chatState: chatState,
                    ref: ref,
                    initialComputerTab: widget.initialComputerTab,
                  ),
          ),
        ],
      ),
    );
  }

  /// Secondary navigation (replaces the old tab bar).
  /// All Chats and Mission Control are accessible from a hamburger menu.
  void _showSecondaryNav(
    BuildContext context,
    Agent? agent,
    String? activeSandboxId,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          height: MediaQuery.of(context).size.height * 0.7,
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(RuhTheme.radiusXxl),
            ),
          ),
          child: DefaultTabController(
            length: 2,
            child: Column(
              children: [
                // Drag handle
                Container(
                  margin: const EdgeInsets.only(top: 8, bottom: 4),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: RuhTheme.borderDefault,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                // Tab bar
                TabBar(
                  labelColor: RuhTheme.primary,
                  unselectedLabelColor: RuhTheme.textTertiary,
                  indicatorColor: RuhTheme.primary,
                  indicatorWeight: 2,
                  tabs: const [
                    Tab(text: 'All Chats'),
                    Tab(text: 'Mission Control'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      TabAllChats(
                        sandboxId: activeSandboxId,
                        onOpenConversation: (conversationId) {
                          Navigator.of(ctx).pop();
                        },
                      ),
                      TabMissionControl(
                        agent: agent,
                        sandboxId: activeSandboxId,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ===========================================================================
// Desktop split layout
// ===========================================================================

class _DesktopLayout extends StatelessWidget {
  final String agentId;
  final String? sandboxId;
  final ChatState? chatState;
  final WidgetRef ref;
  final String initialComputerTab;

  const _DesktopLayout({
    required this.agentId,
    required this.sandboxId,
    required this.chatState,
    required this.ref,
    required this.initialComputerTab,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // ── Left panel: Chat (flex 2) ──
        Expanded(flex: 2, child: _ChatPanel(sandboxId: sandboxId)),

        // ── Right panel: Agent's Computer (flex 3) ──
        if (sandboxId != null && chatState != null)
          Expanded(
            flex: 3,
            child: ComputerView(
              agentId: agentId,
              sandboxId: sandboxId!,
              chatState: chatState!,
              initialTab: initialComputerTab,
            ),
          )
        else
          Expanded(flex: 3, child: _EmptyComputerView()),
      ],
    );
  }
}

// ===========================================================================
// Mobile layout (full-width chat + FAB for computer view)
// ===========================================================================

class _MobileLayout extends StatelessWidget {
  final String agentId;
  final String? sandboxId;
  final ChatState? chatState;
  final WidgetRef ref;
  final String initialComputerTab;

  const _MobileLayout({
    required this.agentId,
    required this.sandboxId,
    required this.chatState,
    required this.ref,
    required this.initialComputerTab,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        _ChatPanel(sandboxId: sandboxId),

        // FAB to open Agent's Computer as bottom sheet
        if (sandboxId != null && chatState != null)
          Positioned(
            right: 16,
            bottom: 80,
            child: FloatingActionButton.small(
              backgroundColor: RuhTheme.primary,
              foregroundColor: Colors.white,
              tooltip: "Open Agent's Computer",
              heroTag: 'computer_fab',
              onPressed: () => _showComputerSheet(context),
              child: const Icon(LucideIcons.monitor, size: IconSizes.md),
            ),
          ),
      ],
    );
  }

  void _showComputerSheet(BuildContext context) {
    final theme = Theme.of(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.3,
        maxChildSize: 0.95,
        builder: (ctx, scrollController) {
          return Container(
            decoration: BoxDecoration(
              color: theme.cardColor,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(RuhTheme.radiusXxl),
              ),
            ),
            child: Column(
              children: [
                // Drag handle
                Container(
                  margin: const EdgeInsets.only(top: 8, bottom: 4),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: RuhTheme.borderDefault,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Expanded(
                  child: ComputerView(
                    agentId: agentId,
                    sandboxId: sandboxId!,
                    chatState: chatState!,
                    initialTab: initialComputerTab,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ===========================================================================
// Empty computer view placeholder
// ===========================================================================

class _EmptyComputerView extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.cardColor,
        border: Border(left: BorderSide(color: theme.dividerColor)),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.monitor,
              size: 48,
              color: RuhTheme.textTertiary.withValues(alpha: 0.4),
            ),
            const SizedBox(height: 16),
            Text(
              "Agent's Computer",
              style: theme.textTheme.titleSmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Activity will appear here when the agent starts working.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ===========================================================================
// Chat header
// ===========================================================================

class _ChatHeader extends ConsumerWidget {
  final Agent? agent;
  final String? activeSandboxId;
  final ValueChanged<String> onSandboxChanged;
  final VoidCallback onBack;
  final VoidCallback onOpenMenu;

  const _ChatHeader({
    required this.agent,
    required this.activeSandboxId,
    required this.onSandboxChanged,
    required this.onBack,
    required this.onOpenMenu,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final sandboxIds = agent?.sandboxIds ?? [];
    final healthAsync = activeSandboxId == null
        ? null
        : ref.watch(sandboxHealthProvider(activeSandboxId!));
    final statusSnapshot = activeSandboxId == null
        ? null
        : deriveRuntimeStatusSnapshot(healthAsync: healthAsync!);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.appBarTheme.backgroundColor,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            // Back button
            IconButton(
              icon: const Icon(LucideIcons.arrowLeft, size: IconSizes.lg),
              onPressed: onBack,
              tooltip: 'Back to agents',
            ),
            const SizedBox(width: 4),

            // Avatar with soul pulse
            SoulPulse(
              intensity: 0.6,
              child: Semantics(
                label: 'Agent avatar ${agent?.avatar ?? ""}',
                excludeSemantics: true,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: RuhTheme.accentLight,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      agent?.avatar ?? '\u{1F916}',
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),

            // Agent name + status
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    agent?.name ?? 'Agent',
                    style: theme.textTheme.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (activeSandboxId != null)
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: statusSnapshot?.color ?? RuhTheme.success,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          statusSnapshot?.label ?? 'Online',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color:
                                statusSnapshot?.color ?? RuhTheme.success,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),

            // Sandbox picker dropdown
            if (sandboxIds.length > 1)
              _SandboxPicker(
                sandboxIds: sandboxIds,
                activeSandboxId: activeSandboxId,
                onChanged: onSandboxChanged,
              ),

            // Hamburger menu for All Chats / Mission Control
            IconButton(
              icon: const Icon(LucideIcons.menu, size: IconSizes.lg),
              onPressed: onOpenMenu,
              tooltip: 'More',
              color: RuhTheme.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

// ===========================================================================
// Sandbox picker dropdown
// ===========================================================================

class _SandboxPicker extends StatelessWidget {
  final List<String> sandboxIds;
  final String? activeSandboxId;
  final ValueChanged<String> onChanged;

  const _SandboxPicker({
    required this.sandboxIds,
    required this.activeSandboxId,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Sandbox picker',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          border: Border.all(color: RuhTheme.borderDefault),
          borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: activeSandboxId,
            isDense: true,
            style: const TextStyle(
              fontSize: 12,
              fontFamily: 'monospace',
              color: RuhTheme.textPrimary,
            ),
            icon: const Icon(LucideIcons.chevronDown, size: IconSizes.sm),
            items: sandboxIds.map((id) {
              final label = id.length >= 8 ? id.substring(0, 8) : id;
              return DropdownMenuItem(
                value: id,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: RuhTheme.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(label),
                  ],
                ),
              );
            }).toList(),
            onChanged: (value) {
              if (value != null) onChanged(value);
            },
          ),
        ),
      ),
    );
  }
}

// ===========================================================================
// Chat panel (messages + input) — used in both desktop and mobile layouts
// ===========================================================================

class _ChatPanel extends ConsumerWidget {
  final String? sandboxId;

  const _ChatPanel({required this.sandboxId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (sandboxId == null) {
      return const Center(
        child: Text(
          'No sandbox available for this agent.',
          style: TextStyle(color: RuhTheme.textTertiary),
        ),
      );
    }

    final chatAsync = ref.watch(chatProvider(sandboxId!));

    return chatAsync.when(
      data: (chatState) =>
          _ChatContent(sandboxId: sandboxId!, chatState: chatState, ref: ref),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: ChatRuntimeStatusBanner(
            sandboxId: sandboxId!,
            chatError: formatError(err),
            onRetryChat: () => ref.invalidate(chatProvider(sandboxId!)),
          ),
        ),
      ),
    );
  }
}

class _ChatContent extends StatelessWidget {
  final String sandboxId;
  final ChatState chatState;
  final WidgetRef ref;

  const _ChatContent({
    required this.sandboxId,
    required this.chatState,
    required this.ref,
  });

  void _handleSend(String text, String? model) {
    ref.read(chatProvider(sandboxId).notifier).sendMessage(text, model: model);
  }

  @override
  Widget build(BuildContext context) {
    final messages = chatState.messages;

    return Container(
      decoration: BoxDecoration(
        border: Border(
          right: BorderSide(
            color: Theme.of(context).dividerColor.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: Column(
        children: [
          ChatRuntimeStatusBanner(
            sandboxId: sandboxId,
            chatError: chatState.error,
            onRetryChat: () => ref.invalidate(chatProvider(sandboxId)),
          ),

          // Messages
          Expanded(
            child: ListView.builder(
              reverse: true,
              padding: const EdgeInsets.symmetric(vertical: 16),
              itemCount:
                  messages.length +
                  (chatState.isStreaming &&
                          messages.isNotEmpty &&
                          !messages.last.isStreaming
                      ? 1
                      : 0),
              itemBuilder: (context, index) {
                // Thinking indicator at top of reversed list
                if (chatState.isStreaming &&
                    messages.isNotEmpty &&
                    !messages.last.isStreaming &&
                    index == 0) {
                  return const _ThinkingIndicator();
                }

                final adjustedIndex =
                    (chatState.isStreaming &&
                        messages.isNotEmpty &&
                        !messages.last.isStreaming)
                    ? index - 1
                    : index;

                final msgIndex = messages.length - 1 - adjustedIndex;
                if (msgIndex < 0 || msgIndex >= messages.length) {
                  return const SizedBox.shrink();
                }
                final msg = messages[msgIndex];

                // Build task plan from current state or message content
                TaskPlan? msgTaskPlan;
                if (msg.isStreaming && chatState.currentTaskPlan != null) {
                  msgTaskPlan = chatState.currentTaskPlan;
                }

                return MessageBubble(
                  content: msg.content,
                  isUser: msg.role == 'user',
                  toolCalls: msg.toolCalls
                      .map(
                        (t) => ToolCall(
                          name: t.name,
                          arguments: t.input != null ? {'input': t.input!} : {},
                        ),
                      )
                      .toList(),
                  steps: msg.steps,
                  isStreaming: msg.isStreaming,
                  taskPlan: msgTaskPlan,
                );
              },
            ),
          ),

          // Task progress footer (visible during streaming)
          TaskProgressFooter(chatState: chatState),

          // Input
          ChatInput(onSend: _handleSend, isStreaming: chatState.isStreaming),
        ],
      ),
    );
  }
}

// ===========================================================================
// Thinking indicator (pulsing dots)
// ===========================================================================

class _ThinkingIndicator extends StatefulWidget {
  const _ThinkingIndicator();

  @override
  State<_ThinkingIndicator> createState() => _ThinkingIndicatorState();
}

class _ThinkingIndicatorState extends State<_ThinkingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: const BoxDecoration(
                gradient: RuhTheme.brandGradient,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text(
                  'R',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            AnimatedBuilder(
              animation: _controller,
              builder: (context, _) {
                return Row(
                  children: List.generate(3, (i) {
                    final delay = i * 0.2;
                    final t = ((_controller.value - delay) % 1.0).clamp(
                      0.0,
                      1.0,
                    );
                    final opacity = (1.0 - (t - 0.5).abs() * 2).clamp(0.3, 1.0);
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Opacity(
                        opacity: opacity,
                        child: Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: RuhTheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    );
                  }),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
