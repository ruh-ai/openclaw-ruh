import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/theme.dart';
import '../../models/agent.dart';
import '../../providers/agent_provider.dart';
import '../../providers/chat_provider.dart';
import 'tabs/tab_all_chats.dart';
import 'tabs/tab_mission_control.dart';
import 'widgets/chat_input.dart';
import 'widgets/message_bubble.dart';

/// Main chat interface matching agent-builder-ui.
///
/// Layout:
/// - Header: back button, avatar + agent name, sandbox picker
/// - Tab bar: Chat | All Chats | Mission Control
/// - Tab content fills remaining space
class ChatScreen extends ConsumerStatefulWidget {
  final String agentId;

  const ChatScreen({super.key, required this.agentId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _switchToChat() {
    _tabController.animateTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final agent = ref.watch(selectedAgentProvider);
    final activeSandboxId = ref.watch(activeSandboxIdProvider);
    final theme = Theme.of(context);

    return Scaffold(
      body: Column(
        children: [
          // ── Header ──
          _ChatHeader(
            agent: agent,
            activeSandboxId: activeSandboxId,
            onSandboxChanged: (id) {
              ref.read(activeSandboxIdProvider.notifier).state = id;
            },
            onBack: () => context.go('/'),
          ),

          // ── Tab bar ──
          Container(
            decoration: BoxDecoration(
              color: theme.appBarTheme.backgroundColor,
              border: const Border(
                bottom: BorderSide(color: RuhTheme.borderMuted),
              ),
            ),
            child: TabBar(
              controller: _tabController,
              labelColor: RuhTheme.primary,
              unselectedLabelColor: RuhTheme.textTertiary,
              indicatorColor: RuhTheme.primary,
              indicatorWeight: 2,
              labelStyle: theme.textTheme.labelLarge,
              unselectedLabelStyle: theme.textTheme.labelMedium,
              tabs: const [
                Tab(text: 'Chat'),
                Tab(text: 'All Chats'),
                Tab(text: 'Mission Control'),
              ],
            ),
          ),

          // ── Tab content ──
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                // Tab 0: Chat
                _ChatTab(
                  sandboxId: activeSandboxId,
                ),
                // Tab 1: All Chats
                TabAllChats(
                  sandboxId: activeSandboxId,
                  onOpenConversation: (conversationId) {
                    // Switch to Chat tab with the selected conversation
                    _switchToChat();
                  },
                ),
                // Tab 2: Mission Control
                TabMissionControl(
                  agent: agent,
                  sandboxId: activeSandboxId,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Chat header
// ---------------------------------------------------------------------------

class _ChatHeader extends StatelessWidget {
  final Agent? agent;
  final String? activeSandboxId;
  final ValueChanged<String> onSandboxChanged;
  final VoidCallback onBack;

  const _ChatHeader({
    required this.agent,
    required this.activeSandboxId,
    required this.onSandboxChanged,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sandboxIds = agent?.sandboxIds ?? [];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: theme.appBarTheme.backgroundColor,
        border: const Border(
          bottom: BorderSide(color: RuhTheme.borderMuted),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            // Back button
            IconButton(
              icon: const Icon(LucideIcons.arrowLeft, size: 20),
              onPressed: onBack,
              tooltip: 'Back to agents',
            ),
            const SizedBox(width: 4),

            // Avatar
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: RuhTheme.accentLight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  agent?.avatar ?? '🤖',
                  style: const TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(width: 10),

            // Agent name
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
                    Text(
                      activeSandboxId!.length >= 8
                          ? activeSandboxId!.substring(0, 8)
                          : activeSandboxId!,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontFamily: 'monospace',
                        color: RuhTheme.textTertiary,
                      ),
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
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sandbox picker dropdown
// ---------------------------------------------------------------------------

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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: RuhTheme.borderDefault),
        borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: activeSandboxId,
          isDense: true,
          style: TextStyle(
            fontSize: 12,
            fontFamily: 'monospace',
            color: RuhTheme.textPrimary,
          ),
          icon: const Icon(LucideIcons.chevronDown, size: 14),
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
    );
  }
}

// ---------------------------------------------------------------------------
// Chat tab (messages + input)
// ---------------------------------------------------------------------------

class _ChatTab extends ConsumerWidget {
  final String? sandboxId;

  const _ChatTab({required this.sandboxId});

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
    final theme = Theme.of(context);

    return chatAsync.when(
      data: (chatState) => _ChatContent(
        sandboxId: sandboxId!,
        chatState: chatState,
        ref: ref,
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.wifiOff, size: 40, color: RuhTheme.textTertiary),
            const SizedBox(height: 16),
            Text('Could not connect to agent',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              err.toString(),
              style: const TextStyle(color: RuhTheme.textTertiary, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
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

    return Column(
      children: [
        // Error banner
        if (chatState.error != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: RuhTheme.error.withValues(alpha: 0.1),
            child: Row(
              children: [
                Icon(LucideIcons.alertCircle, size: 14, color: RuhTheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    chatState.error!,
                    style: TextStyle(fontSize: 12, color: RuhTheme.error),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),

        // Messages
        Expanded(
          child: ListView.builder(
            reverse: true,
            padding: const EdgeInsets.symmetric(vertical: 16),
            itemCount: messages.length +
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

              final adjustedIndex = (chatState.isStreaming &&
                      messages.isNotEmpty &&
                      !messages.last.isStreaming)
                  ? index - 1
                  : index;

              final msgIndex = messages.length - 1 - adjustedIndex;
              if (msgIndex < 0 || msgIndex >= messages.length) {
                return const SizedBox.shrink();
              }
              final msg = messages[msgIndex];

              return MessageBubble(
                content: msg.content,
                isUser: msg.role == 'user',
                toolCalls: msg.toolCalls
                    .map((t) => ToolCall(
                          name: t.name,
                          arguments:
                              t.input != null ? {'input': t.input!} : {},
                        ))
                    .toList(),
                steps: msg.steps,
                isStreaming: msg.isStreaming,
              );
            },
          ),
        ),

        // Input
        ChatInput(
          onSend: _handleSend,
          isStreaming: chatState.isStreaming,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Thinking indicator (pulsing dots)
// ---------------------------------------------------------------------------

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
                    final t =
                        ((_controller.value - delay) % 1.0).clamp(0.0, 1.0);
                    final opacity =
                        (1.0 - (t - 0.5).abs() * 2).clamp(0.3, 1.0);
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
