import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/responsive.dart';
import '../../../config/theme.dart';
import '../../../widgets/alive_animations.dart';

/// Available LLM model options for the chat model selector.
const List<_ModelOption> _modelOptions = [
  _ModelOption(id: 'claude-sonnet-4-6', label: 'Sonnet 4.6'),
  _ModelOption(id: 'claude-opus-4-6', label: 'Opus 4.6'),
  _ModelOption(id: 'gpt-4o', label: 'GPT-4o'),
  _ModelOption(id: 'auto', label: 'Auto'),
];

class _ModelOption {
  final String id;
  final String label;

  const _ModelOption({required this.id, required this.label});
}

/// Chat text input with model selector and send button.
///
/// On desktop: Enter sends, Shift+Enter inserts newline.
/// On mobile: send button only (Enter inserts newline).
class ChatInput extends StatefulWidget {
  /// Callback with the message text and optionally the selected model ID.
  final void Function(String text, String? model) onSend;
  final bool isStreaming;

  const ChatInput({super.key, required this.onSend, this.isStreaming = false});

  @override
  State<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends State<ChatInput> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  String _selectedModel = _modelOptions.first.id;

  bool get _hasText => _controller.text.trim().isNotEmpty;

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty || widget.isStreaming) return;
    widget.onSend(text, _selectedModel == 'auto' ? null : _selectedModel);
    _controller.clear();
    _focusNode.requestFocus();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.sizeOf(context).width >= Breakpoints.tablet;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(top: BorderSide(color: RuhTheme.borderMuted)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // -- Model selector row --
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Icon(LucideIcons.cpu, size: 13, color: RuhTheme.textTertiary),
                  const SizedBox(width: 4),
                  Text(
                    'Model:',
                    style: TextStyle(
                      fontSize: 11,
                      color: RuhTheme.textTertiary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 6),
                  ..._modelOptions.map((opt) {
                    final isSelected = opt.id == _selectedModel;
                    return Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: InkWell(
                        onTap: () => setState(() => _selectedModel = opt.id),
                        borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? RuhTheme.primary.withValues(alpha: 0.1)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(
                              RuhTheme.radiusSm,
                            ),
                            border: Border.all(
                              color: isSelected
                                  ? RuhTheme.primary.withValues(alpha: 0.3)
                                  : RuhTheme.borderMuted,
                            ),
                          ),
                          child: Text(
                            opt.label,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                              color: isSelected
                                  ? RuhTheme.primary
                                  : RuhTheme.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),

            // -- Input + send button row --
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // -- Text field --
                Expanded(
                  child: BreathingFocus(
                    child: KeyboardListener(
                      focusNode: FocusNode(), // wrapper for key events
                      onKeyEvent: isDesktop
                          ? (event) {
                              if (event is KeyDownEvent &&
                                  event.logicalKey ==
                                      LogicalKeyboardKey.enter &&
                                  !HardwareKeyboard.instance.isShiftPressed) {
                                _send();
                              }
                            }
                          : null,
                      child: TextField(
                        controller: _controller,
                        focusNode: _focusNode,
                        maxLines: 5,
                        minLines: 1,
                        textInputAction: isDesktop
                            ? TextInputAction.none
                            : TextInputAction.newline,
                        enabled: !widget.isStreaming,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: widget.isStreaming
                              ? 'Waiting for response...'
                              : 'Message your agent...',
                          hintStyle: TextStyle(color: RuhTheme.textTertiary),
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              RuhTheme.radiusXxl,
                            ),
                            borderSide: const BorderSide(
                              color: RuhTheme.borderDefault,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              RuhTheme.radiusXxl,
                            ),
                            borderSide: const BorderSide(
                              color: RuhTheme.borderDefault,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              RuhTheme.radiusXxl,
                            ),
                            borderSide: const BorderSide(
                              color: RuhTheme.primary,
                              width: 1.5,
                            ),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 12,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // -- Send button --
                _SendButton(
                  onPressed: _hasText && !widget.isStreaming ? _send : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Circular send button with brand gradient.
class _SendButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const _SendButton({this.onPressed});

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null;

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: enabled ? 1.0 : 0.4,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          gradient: enabled ? RuhTheme.brandGradient : null,
          color: enabled ? null : Colors.grey.shade300,
          shape: BoxShape.circle,
        ),
        child: IconButton(
          onPressed: onPressed,
          icon: const Icon(LucideIcons.arrowUp, color: Colors.white, size: 20),
          padding: EdgeInsets.zero,
          tooltip: 'Send',
        ),
      ),
    );
  }
}
