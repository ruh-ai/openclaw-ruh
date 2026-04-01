import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../config/theme.dart';
import '../../services/api_client.dart';
import '../../services/forge_service.dart';
import '../../services/logger.dart';

/// Full-screen dialog for creating a new agent via the forge pipeline.
///
/// **Step 1 — Input form:** agent name + optional description.
/// **Step 2 — Forge progress:** terminal-style log viewer streaming SSE events.
class CreateAgentDialog extends StatefulWidget {
  /// Called when creation completes successfully with the new agent ID.
  final ValueChanged<String>? onCreated;

  const CreateAgentDialog({super.key, this.onCreated});

  @override
  State<CreateAgentDialog> createState() => _CreateAgentDialogState();
}

class _CreateAgentDialogState extends State<CreateAgentDialog> {
  static const String _tag = 'CreateAgentDialog';

  // ── Form state ──
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  // ── Forge state ──
  bool _isForging = false;
  bool _isDone = false;
  bool _hasError = false;
  String? _agentId;
  String? _errorMessage;
  final List<String> _logLines = [];
  final ScrollController _scrollCtrl = ScrollController();
  StreamSubscription<ForgeEvent>? _forgeSub;

  late final ForgeService _forgeService;

  @override
  void initState() {
    super.initState();
    _forgeService = ForgeService(client: ApiClient());
  }

  @override
  void dispose() {
    _forgeSub?.cancel();
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _startForge() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isForging = true;
      _isDone = false;
      _hasError = false;
      _errorMessage = null;
      _logLines.clear();
    });

    Log.i(_tag, 'Starting forge for "${_nameCtrl.text}"');

    try {
      final result = await _forgeService.createAgent(
        name: _nameCtrl.text.trim(),
        description: _descCtrl.text.trim().isEmpty
            ? null
            : _descCtrl.text.trim(),
      );

      _agentId = result.agentId;
      _appendLog('[forge] Agent created — streaming progress...');

      _forgeSub = _forgeService
          .streamForgeProgress(result.agentId, result.streamId)
          .listen(
            _onForgeEvent,
            onError: (Object err) {
              Log.e(_tag, 'Forge stream error', err);
              _setError('Stream error: $err');
            },
            onDone: () {
              Log.i(_tag, 'Forge stream ended');
              if (!_isDone && !_hasError) {
                // Stream ended without an explicit result/error event.
                setState(() => _isDone = true);
              }
            },
          );
    } catch (e, st) {
      Log.e(_tag, 'Failed to create agent', e, st);
      _setError('Failed to start forge: $e');
    }
  }

  void _onForgeEvent(ForgeEvent event) {
    switch (event.type) {
      case ForgeEventType.log:
        _appendLog(event.message);
        break;

      case ForgeEventType.approved:
        _appendLog('[approved] ${event.message}');
        break;

      case ForgeEventType.result:
        _appendLog('[done] ${event.message}');
        // If the result contains an agent_id, prefer it.
        if (event.data?['agent_id'] != null) {
          _agentId = event.data!['agent_id'] as String;
        }
        setState(() {
          _isDone = true;
          _hasError = false;
        });
        break;

      case ForgeEventType.error:
        Log.e(_tag, 'Forge error event: ${event.message}');
        _appendLog('[error] ${event.message}');
        _setError(event.message);
        break;
    }
  }

  void _appendLog(String line) {
    setState(() => _logLines.add(line));
    // Auto-scroll to bottom on next frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _setError(String message) {
    setState(() {
      _hasError = true;
      _errorMessage = message;
    });
  }

  void _retry() {
    _forgeSub?.cancel();
    _startForge();
  }

  void _openChat() {
    if (_agentId != null) {
      widget.onCreated?.call(_agentId!);
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(RuhTheme.radiusXxl),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520, maxHeight: 640),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _isForging ? _buildForgeView() : _buildFormView(),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: Input form
  // ---------------------------------------------------------------------------

  Widget _buildFormView() {
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: RuhTheme.brandGradient,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Center(
                child: Icon(Icons.auto_awesome, color: Colors.white, size: 20),
              ),
            ),
            const SizedBox(width: 12),
            Text('Create Agent', style: theme.textTheme.headlineLarge),
          ],
        ),
        const SizedBox(height: 24),

        // Form
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Agent Name',
                  hintText: 'e.g. Google Ads Manager',
                ),
                textInputAction: TextInputAction.next,
                autofocus: true,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Agent name is required';
                  }
                  if (value.trim().length < 2) {
                    return 'Name must be at least 2 characters';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descCtrl,
                decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  hintText: 'What should this agent do?',
                  alignLabelWithHint: true,
                ),
                maxLines: 3,
                textInputAction: TextInputAction.done,
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Actions
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            const SizedBox(width: 12),
            _GradientButton(
              onPressed: _startForge,
              label: 'Create',
              icon: Icons.rocket_launch,
            ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: Forge progress
  // ---------------------------------------------------------------------------

  Widget _buildForgeView() {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header
        Row(
          children: [
            if (!_isDone && !_hasError)
              const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else if (_isDone)
              const Icon(Icons.check_circle, color: RuhTheme.success, size: 20)
            else
              const Icon(Icons.error_outline, color: RuhTheme.error, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _isDone
                    ? 'Agent Ready'
                    : _hasError
                    ? 'Creation Failed'
                    : 'Forging Agent...',
                style: theme.textTheme.headlineMedium,
              ),
            ),
            if (!_isDone && !_hasError)
              TextButton(
                onPressed: () {
                  _forgeSub?.cancel();
                  Navigator.of(context).pop();
                },
                child: const Text('Cancel'),
              ),
          ],
        ),
        const SizedBox(height: 16),

        // Terminal log view
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1A1A2E),
              borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
              border: Border.all(color: const Color(0xFF2A2A3E)),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Terminal title bar
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: const BoxDecoration(
                      color: Color(0xFF16162A),
                      border: Border(
                        bottom: BorderSide(color: Color(0xFF2A2A3E)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: _isDone
                                ? RuhTheme.success
                                : _hasError
                                ? RuhTheme.error
                                : RuhTheme.warning,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'forge',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 11,
                            color: const Color(0xFF8888AA),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Log lines
                  Expanded(
                    child: ListView.builder(
                      controller: _scrollCtrl,
                      padding: const EdgeInsets.all(12),
                      itemCount: _logLines.length,
                      itemBuilder: (context, index) {
                        final line = _logLines[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 2),
                          child: Text(
                            line,
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 12,
                              height: 1.5,
                              color: _logLineColor(line),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Bottom actions
        if (_hasError)
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (_errorMessage != null)
                Expanded(
                  child: Text(
                    _errorMessage!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: RuhTheme.error,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const SizedBox(width: 12),
              TextButton(
                onPressed: () {
                  _forgeSub?.cancel();
                  Navigator.of(context).pop();
                },
                child: const Text('Close'),
              ),
              const SizedBox(width: 8),
              _GradientButton(
                onPressed: _retry,
                label: 'Retry',
                icon: Icons.refresh,
              ),
            ],
          )
        else if (_isDone)
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Close'),
              ),
              const SizedBox(width: 12),
              _GradientButton(
                onPressed: _openChat,
                label: 'Open Chat',
                icon: Icons.chat_bubble_outline,
              ),
            ],
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Colorize terminal lines based on prefix tags.
  Color _logLineColor(String line) {
    if (line.startsWith('[error]')) return const Color(0xFFFF6B6B);
    if (line.startsWith('[done]')) return const Color(0xFF51CF66);
    if (line.startsWith('[approved]')) return const Color(0xFF69DB7C);
    if (line.startsWith('[forge]')) return const Color(0xFFB197FC);
    return const Color(0xFFCCCCDD);
  }
}

// ---------------------------------------------------------------------------
// Gradient button (matches brand style)
// ---------------------------------------------------------------------------

class _GradientButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String label;
  final IconData icon;

  const _GradientButton({
    required this.onPressed,
    required this.label,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RuhTheme.brandGradient,
        borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
        boxShadow: [
          BoxShadow(
            color: RuhTheme.primary.withValues(alpha: 0.25),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
          ),
        ),
      ),
    );
  }
}
