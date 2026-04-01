import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../providers/chat_provider.dart';

/// Dark-themed terminal panel showing command execution from tool events.
///
/// Matches the agent-builder-ui terminal panel: dark background, green text,
/// numbered commands with status indicators.
class TerminalPanel extends StatelessWidget {
  final List<TerminalCommand> commands;

  const TerminalPanel({super.key, required this.commands});

  static const _bgColor = Color(0xFF0C0A14);
  static const _greenText = Color(0xFF7EE787);
  static const _yellowText = Color(0xFFF5B14C);
  static const _dimText = Color(0xFF6B7280);
  static const _headerBg = Color(0xFF1A1A2E);

  @override
  Widget build(BuildContext context) {
    return Container(
      color: _bgColor,
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: _headerBg,
            child: Row(
              children: [
                // Traffic lights
                Row(
                  children: [
                    _dot(const Color(0xFFFF5F56)),
                    const SizedBox(width: 6),
                    _dot(const Color(0xFFFFBD2E)),
                    const SizedBox(width: 6),
                    _dot(const Color(0xFF27C93F)),
                  ],
                ),
                const SizedBox(width: 12),
                const Text(
                  'AGENT TERMINAL',
                  style: TextStyle(
                    color: _greenText,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'monospace',
                    letterSpacing: 0.5,
                  ),
                ),
                const Spacer(),
                Text(
                  '${commands.length} command${commands.length == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: _dimText,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 8),
                _StatusBadge(
                  isRunning: commands.any((c) => c.status == 'running'),
                ),
              ],
            ),
          ),

          // Commands
          Expanded(
            child: commands.isEmpty
                ? const Center(
                    child: Text(
                      'Terminal activity from the agent appears here.',
                      style: TextStyle(
                        color: _dimText,
                        fontSize: 12,
                        fontFamily: 'monospace',
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: commands.length,
                    itemBuilder: (context, index) =>
                        _CommandEntry(command: commands[index], index: index),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _dot(Color color) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final bool isRunning;

  const _StatusBadge({required this.isRunning});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: isRunning
            ? TerminalPanel._yellowText.withValues(alpha: 0.15)
            : TerminalPanel._greenText.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(
              color: isRunning
                  ? TerminalPanel._yellowText
                  : TerminalPanel._greenText,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            isRunning ? 'live' : 'ready',
            style: TextStyle(
              color: isRunning
                  ? TerminalPanel._yellowText
                  : TerminalPanel._greenText,
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _CommandEntry extends StatelessWidget {
  final TerminalCommand command;
  final int index;

  const _CommandEntry({required this.command, required this.index});

  @override
  Widget build(BuildContext context) {
    final isDone = command.status == 'done';
    final elapsed = command.elapsedMs != null
        ? '${(command.elapsedMs! / 1000).toStringAsFixed(1)}s'
        : null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: index + tool name + status
          Row(
            children: [
              Text(
                index.toString().padLeft(2, '0'),
                style: const TextStyle(
                  color: TerminalPanel._dimText,
                  fontSize: 11,
                  fontFamily: 'monospace',
                ),
              ),
              const Text(
                '. ',
                style: TextStyle(
                  color: TerminalPanel._dimText,
                  fontSize: 11,
                  fontFamily: 'monospace',
                ),
              ),
              Text(
                command.toolName,
                style: const TextStyle(
                  color: TerminalPanel._greenText,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 8),
              if (isDone) ...[
                const Icon(
                  LucideIcons.check,
                  size: 12,
                  color: TerminalPanel._greenText,
                ),
                if (elapsed != null) ...[
                  const SizedBox(width: 4),
                  Text(
                    elapsed,
                    style: const TextStyle(
                      color: TerminalPanel._dimText,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ] else
                const Text(
                  'running...',
                  style: TextStyle(
                    color: TerminalPanel._yellowText,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  ),
                ),
            ],
          ),

          // Command
          if (command.command.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 28, top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '\$ ',
                    style: TextStyle(
                      color: TerminalPanel._greenText,
                      fontSize: 12,
                      fontFamily: 'monospace',
                    ),
                  ),
                  Expanded(
                    child: Text(
                      command.command,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontFamily: 'monospace',
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Output
          if (command.output != null && command.output!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 28, top: 4),
              child: Text(
                command.output!.length > 500
                    ? '${command.output!.substring(0, 500)}...'
                    : command.output!,
                style: const TextStyle(
                  color: TerminalPanel._dimText,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  height: 1.4,
                ),
                maxLines: 20,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }
}
