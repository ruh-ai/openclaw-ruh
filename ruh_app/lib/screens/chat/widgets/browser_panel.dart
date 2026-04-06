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
  final BackendClient? client;
  final Duration pollInterval;

  const BrowserPanel({
    super.key,
    required this.sandboxId,
    required this.browserState,
    this.isAgentActive = false,
    this.client,
    this.pollInterval = const Duration(milliseconds: 750),
  });

  @override
  State<BrowserPanel> createState() => _BrowserPanelState();
}

class _BrowserPanelState extends State<BrowserPanel> {
  Timer? _pollTimer;
  Uint8List? _screenshot;
  String? _error;
  bool _isRefreshing = false;
  bool _pollInFlight = false;

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
      widget.pollInterval,
      (_) => _poll(),
    );
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _poll({bool manual = false}) async {
    if (_pollInFlight) return;
    _pollInFlight = true;
    if (manual && mounted) {
      setState(() => _isRefreshing = true);
    }
    try {
      final client = widget.client ?? ApiClient();
      final response = await client.getBytes(
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
    } finally {
      _pollInFlight = false;
      if (manual && mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  Future<void> _refreshNow() async {
    await _poll(manual: true);
  }

  String get _statusLabel {
    if (_error != null) return _error!;
    if (_screenshot != null) return 'Browser connected';
    return 'Connecting to browser...';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0xFF111827),
            border: Border(bottom: BorderSide(color: Color(0xFF1F2937))),
          ),
          child: Row(
            children: [
              Icon(
                _error != null
                    ? LucideIcons.monitorOff
                    : LucideIcons.monitor,
                size: 14,
                color: _error != null
                    ? RuhTheme.warning
                    : RuhTheme.textTertiary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _statusLabel,
                  style: const TextStyle(
                    fontSize: 12,
                    color: RuhTheme.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              IconButton(
                onPressed: _isRefreshing ? null : _refreshNow,
                tooltip: 'Refresh browser',
                iconSize: 14,
                constraints: const BoxConstraints(
                  minWidth: 28,
                  minHeight: 28,
                ),
                padding: EdgeInsets.zero,
                icon: _isRefreshing
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(
                        LucideIcons.refreshCw,
                        size: 14,
                        color: RuhTheme.textTertiary,
                      ),
              ),
            ],
          ),
        ),
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
                        _statusLabel,
                        style: const TextStyle(
                          color: RuhTheme.textTertiary,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _refreshNow,
                        icon: const Icon(LucideIcons.refreshCw, size: 14),
                        label: const Text('Retry'),
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
