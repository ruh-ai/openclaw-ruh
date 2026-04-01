import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';
import 'agent_step_widget.dart';

/// Represents a tool call made by the assistant.
class ToolCall {
  final String name;
  final Map<String, dynamic> arguments;

  const ToolCall({required this.name, required this.arguments});
}

/// A chat message bubble for user or assistant messages.
///
/// User messages are right-aligned with a light gray background.
/// Assistant messages are left-aligned with a white background,
/// a subtle border, and an agent avatar circle.
class MessageBubble extends StatelessWidget {
  final String content;
  final bool isUser;
  final List<ToolCall>? toolCalls;
  final List<ChatStep>? steps;
  final bool isStreaming;
  final String? agentName;
  final String? agentAvatar;

  const MessageBubble({
    super.key,
    required this.content,
    required this.isUser,
    this.toolCalls,
    this.steps,
    this.isStreaming = false,
    this.agentName,
    this.agentAvatar,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (isUser) {
      return _buildUserBubble(theme);
    }
    return _buildAssistantBubble(theme);
  }

  Widget _buildUserBubble(ThemeData theme) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 560),
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(RuhTheme.radiusXxl),
        ),
        child: Text(
          content,
          style: theme.textTheme.bodyMedium,
        ),
      ),
    );
  }

  Widget _buildAssistantBubble(ThemeData theme) {
    final hasSteps = steps != null && steps!.isNotEmpty;
    final avatarText = agentAvatar ?? 'R';
    // Check if avatar is an emoji (multi-byte) vs a letter
    final isEmoji = avatarText.length > 1 ||
        (avatarText.codeUnitAt(0) > 127);

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600),
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Agent avatar circle
            Container(
              width: 28,
              height: 28,
              margin: const EdgeInsets.only(top: 4),
              decoration: BoxDecoration(
                gradient: isEmoji ? null : RuhTheme.brandGradient,
                color: isEmoji ? RuhTheme.accentLight : null,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  avatarText,
                  style: TextStyle(
                    color: isEmoji ? null : Colors.white,
                    fontSize: isEmoji ? 16 : 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),

            // Message content
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Agent name label
                  if (agentName != null && agentName!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4, left: 2),
                      child: Text(
                        agentName!,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: RuhTheme.textSecondary,
                        ),
                      ),
                    ),

                  // Agent steps (thinking / tool execution)
                  if (hasSteps)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: steps!
                            .map((step) => AgentStepWidget(step: step))
                            .toList(),
                      ),
                    ),

                  // Main message bubble
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius:
                          BorderRadius.circular(RuhTheme.radiusXxl),
                      border: Border.all(color: RuhTheme.borderDefault),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Main text content
                        if (content.isNotEmpty)
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: content),
                                // Blinking cursor for streaming
                                if (isStreaming)
                                  const WidgetSpan(
                                    child: _BlinkingCursor(),
                                  ),
                              ],
                            ),
                            style: theme.textTheme.bodyMedium,
                          ),
                      ],
                    ),
                  ),

                  // Tool calls
                  if (toolCalls != null && toolCalls!.isNotEmpty)
                    ...toolCalls!.map((tc) => _ToolCallCard(toolCall: tc)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Expandable card showing a tool call's name and arguments.
class _ToolCallCard extends StatefulWidget {
  final ToolCall toolCall;

  const _ToolCallCard({required this.toolCall});

  @override
  State<_ToolCallCard> createState() => _ToolCallCardState();
}

class _ToolCallCardState extends State<_ToolCallCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
        border: Border.all(color: RuhTheme.borderMuted),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.build_outlined,
                    size: 14,
                    color: RuhTheme.textTertiary,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    widget.toolCall.name,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  Icon(
                    _expanded
                        ? Icons.expand_less
                        : Icons.expand_more,
                    size: 16,
                    color: RuhTheme.textTertiary,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                widget.toolCall.arguments.entries
                    .map((e) => '${e.key}: ${e.value}')
                    .join('\n'),
                style: theme.textTheme.bodySmall?.copyWith(
                  fontFamily: 'monospace',
                  fontSize: 11,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A blinking cursor shown at the end of streaming text.
class _BlinkingCursor extends StatefulWidget {
  const _BlinkingCursor();

  @override
  State<_BlinkingCursor> createState() => _BlinkingCursorState();
}

class _BlinkingCursorState extends State<_BlinkingCursor>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller,
      child: const Text(
        '\u258C', // block cursor
        style: TextStyle(
          color: RuhTheme.primary,
          fontSize: 14,
          fontWeight: FontWeight.w300,
        ),
      ),
    );
  }
}
