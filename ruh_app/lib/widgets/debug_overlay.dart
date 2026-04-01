import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/api_config.dart';
import '../services/logger.dart';

/// Floating debug overlay that shows live logs.
///
/// Only visible in debug mode. Toggle with a floating action button
/// or by shaking the device (mobile).
class DebugOverlay extends StatefulWidget {
  final Widget child;

  const DebugOverlay({super.key, required this.child});

  @override
  State<DebugOverlay> createState() => _DebugOverlayState();
}

class _DebugOverlayState extends State<DebugOverlay> {
  bool _visible = false;
  final List<LogEntry> _recentLogs = [];
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    Log.addListener(_onLog);
  }

  @override
  void dispose() {
    Log.removeListener(_onLog);
    _scrollController.dispose();
    super.dispose();
  }

  void _onLog(LogEntry entry) {
    if (!mounted) return;
    setState(() {
      _recentLogs.add(entry);
      if (_recentLogs.length > 200) {
        _recentLogs.removeAt(0);
      }
    });
    // Auto-scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return widget.child;

    return Stack(
      children: [
        widget.child,

        // FAB to toggle
        Positioned(
          right: 8,
          bottom: 8,
          child: FloatingActionButton.small(
            heroTag: 'debug_fab',
            backgroundColor: Colors.black87,
            onPressed: () => setState(() => _visible = !_visible),
            child: Icon(
              _visible ? Icons.close : Icons.bug_report,
              color: Colors.greenAccent,
              size: 18,
            ),
          ),
        ),

        // Log panel
        if (_visible)
          Positioned(
            left: 0,
            right: 0,
            bottom: 56,
            height: MediaQuery.sizeOf(context).height * 0.4,
            child: _LogPanel(
              logs: _recentLogs,
              scrollController: _scrollController,
              onClear: () => setState(() {
                _recentLogs.clear();
                Log.clear();
              }),
              onCopy: () {
                final text = _recentLogs.map((e) => e.formatted).join('\n');
                Clipboard.setData(ClipboardData(text: text));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Logs copied to clipboard'),
                    duration: Duration(seconds: 1),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

class _LogPanel extends StatelessWidget {
  final List<LogEntry> logs;
  final ScrollController scrollController;
  final VoidCallback onClear;
  final VoidCallback onCopy;

  const _LogPanel({
    required this.logs,
    required this.scrollController,
    required this.onClear,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xF0121212),
        border: const Border(top: BorderSide(color: Colors.greenAccent, width: 1)),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            color: const Color(0xFF1a1a2e),
            child: Row(
              children: [
                const Icon(Icons.terminal, color: Colors.greenAccent, size: 14),
                const SizedBox(width: 6),
                const Text(
                  'Debug Console',
                  style: TextStyle(
                    color: Colors.greenAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'API: ${ApiConfig.baseUrl}',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  ),
                ),
                const Spacer(),
                Text(
                  '${logs.length} entries',
                  style: const TextStyle(
                    color: Colors.white38,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 8),
                _ToolButton(icon: Icons.copy, onTap: onCopy, tooltip: 'Copy'),
                _ToolButton(icon: Icons.delete_outline, onTap: onClear, tooltip: 'Clear'),
              ],
            ),
          ),
          // Log entries
          Expanded(
            child: logs.isEmpty
                ? const Center(
                    child: Text(
                      'No logs yet. Interact with the app to see activity.',
                      style: TextStyle(
                        color: Colors.white38,
                        fontSize: 11,
                        fontFamily: 'monospace',
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: scrollController,
                    padding: const EdgeInsets.all(8),
                    itemCount: logs.length,
                    itemBuilder: (context, index) {
                      final entry = logs[index];
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          entry.formatted,
                          style: TextStyle(
                            color: _colorForLevel(entry.level),
                            fontSize: 11,
                            fontFamily: 'monospace',
                            height: 1.4,
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Color _colorForLevel(LogLevel level) {
    switch (level) {
      case LogLevel.debug:
        return Colors.white38;
      case LogLevel.info:
        return Colors.white70;
      case LogLevel.warn:
        return Colors.orangeAccent;
      case LogLevel.error:
        return Colors.redAccent;
    }
  }
}

class _ToolButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;

  const _ToolButton({
    required this.icon,
    required this.onTap,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(icon, color: Colors.white54, size: 14),
        ),
      ),
    );
  }
}
