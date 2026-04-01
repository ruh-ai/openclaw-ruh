import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';
import '../../../services/api_client.dart';

/// Browser panel showing live screenshot polling and navigation history.
class BrowserPanel extends StatefulWidget {
  final String sandboxId;
  final BrowserWorkspaceState browserState;
  final bool isAgentActive;

  const BrowserPanel({
    super.key,
    required this.sandboxId,
    required this.browserState,
    this.isAgentActive = false,
  });

  @override
  State<BrowserPanel> createState() => _BrowserPanelState();
}

class _BrowserPanelState extends State<BrowserPanel> {
  Timer? _pollTimer;
  Uint8List? _screenshot;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startPolling();
  }

  @override
  void didUpdateWidget(BrowserPanel old) {
    super.didUpdateWidget(old);
    if (old.sandboxId != widget.sandboxId) {
      _stopPolling();
      _startPolling();
    }
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }

  void _startPolling() {
    _poll();
    _pollTimer = Timer.periodic(
      const Duration(milliseconds: 750),
      (_) => _poll(),
    );
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _poll() async {
    try {
      final client = ApiClient();
      final response = await client.get<List<int>>(
        '/api/sandboxes/${widget.sandboxId}/browser/screenshot',
      );
      if (!mounted) return;
      final data = response.data;
      if (data != null && data.length > 200) {
        setState(() {
          _screenshot = Uint8List.fromList(data);
          _error = null;
        });
      } else {
        setState(() {
          _error = 'Display not available';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Browser not connected';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Screenshot area
        Expanded(
          flex: 3,
          child: _screenshot != null
              ? Stack(
                  children: [
                    Positioned.fill(
                      child: Image.memory(
                        _screenshot!,
                        fit: BoxFit.contain,
                        gaplessPlayback: true,
                      ),
                    ),
                    if (widget.isAgentActive)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black54,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                LucideIcons.monitor,
                                size: 12,
                                color: Colors.greenAccent,
                              ),
                              SizedBox(width: 4),
                              Text(
                                'Agent active',
                                style: TextStyle(
                                  color: Colors.greenAccent,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                )
              : Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _error != null
                            ? LucideIcons.monitorOff
                            : LucideIcons.monitor,
                        size: 32,
                        color: RuhTheme.textTertiary,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _error ?? 'Connecting to browser...',
                        style: const TextStyle(
                          color: RuhTheme.textTertiary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
        ),

        // Navigation history
        if (widget.browserState.items.isNotEmpty) ...[
          const Divider(height: 1),
          Expanded(
            flex: 1,
            child: ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: widget.browserState.items.length,
              itemBuilder: (context, index) {
                final item = widget
                    .browserState
                    .items[widget.browserState.items.length - 1 - index];
                return _NavHistoryItem(item: item);
              },
            ),
          ),
        ],
      ],
    );
  }
}

class _NavHistoryItem extends StatelessWidget {
  final BrowserNavItem item;

  const _NavHistoryItem({required this.item});

  @override
  Widget build(BuildContext context) {
    final isNav = item.kind == 'navigation';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(
            isNav ? LucideIcons.globe : LucideIcons.mousePointer,
            size: 12,
            color: RuhTheme.textTertiary,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              item.url ?? item.label,
              style: TextStyle(
                fontSize: 12,
                color: isNav ? RuhTheme.primary : RuhTheme.textSecondary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(
            _timeAgo(item.timestamp),
            style: const TextStyle(fontSize: 10, color: RuhTheme.textTertiary),
          ),
        ],
      ),
    );
  }

  String _timeAgo(int timestamp) {
    final diff = DateTime.now().millisecondsSinceEpoch - timestamp;
    if (diff < 60000) return '${(diff / 1000).round()}s ago';
    if (diff < 3600000) return '${(diff / 60000).round()}m ago';
    return '${(diff / 3600000).round()}h ago';
  }
}
