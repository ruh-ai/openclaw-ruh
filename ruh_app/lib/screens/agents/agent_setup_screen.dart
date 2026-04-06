import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/theme.dart';
import '../../models/agent.dart';
import '../../models/customer_agent_config.dart';
import '../../providers/agent_provider.dart';
import '../../services/api_client.dart';
import '../../utils/error_formatter.dart';

/// Setup screen shown before agent launch when user_required runtime inputs
/// are missing. Only shows credentials the user must provide — AI-inferred
/// and static-default values are collapsed in an "Advanced" section.
class AgentSetupScreen extends ConsumerStatefulWidget {
  final Agent agent;

  const AgentSetupScreen({super.key, required this.agent});

  @override
  ConsumerState<AgentSetupScreen> createState() => _AgentSetupScreenState();
}

class _AgentSetupScreenState extends ConsumerState<AgentSetupScreen>
    with SingleTickerProviderStateMixin {
  late List<AgentRuntimeInput> _inputs;
  bool _saving = false;
  bool _inferring = false;
  bool _advancedOpen = false;
  late AnimationController _fadeController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _inputs = widget.agent.runtimeInputs
        .map((i) => AgentRuntimeInput.fromJson(i.toJson()))
        .toList();
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _fadeAnimation = CurvedAnimation(
      parent: _fadeController,
      curve: Curves.easeOut,
    );
    _fadeController.forward();
    _inferAiValues();
  }

  @override
  void dispose() {
    _fadeController.dispose();
    super.dispose();
  }

  // ── AI Inference ─────────────────────────────────────────────────────

  Future<void> _inferAiValues() async {
    final inferrable = _inputs
        .where((i) => i.populationStrategy == 'ai_inferred' && !i.isFilled)
        .toList();
    if (inferrable.isEmpty) return;

    setState(() => _inferring = true);
    try {
      final client = ApiClient();
      final response = await client.post<Map<String, dynamic>>(
        '/api/agents/${widget.agent.id}/infer-inputs',
        data: {
          'variables': inferrable
              .map((v) => {
                    'key': v.key,
                    'label': v.label,
                    'description': v.description,
                    if (v.example != null) 'example': v.example,
                    if (v.options != null) 'options': v.options,
                  })
              .toList(),
        },
      );
      final values = (response.data?['values'] as Map<String, dynamic>?) ?? {};
      if (values.isNotEmpty && mounted) {
        setState(() {
          for (final input in _inputs) {
            final suggested = values[input.key];
            if (suggested is String && suggested.isNotEmpty && !input.isFilled) {
              input.value = suggested;
            }
          }
        });
      }
    } catch (_) {
      // Non-fatal — user can fill manually
    } finally {
      if (mounted) setState(() => _inferring = false);
    }
  }

  // ── Save & Continue ──────────────────────────────────────────────────

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final service = ref.read(agentServiceProvider);
      final updates = _inputs
          .map((i) => RuntimeInputValueUpdate(
                key: i.key,
                value: i.value.trim().isNotEmpty
                    ? i.value
                    : (i.defaultValue ?? ''),
              ))
          .toList();
      await service.updateCustomerConfig(
        widget.agent.id,
        runtimeInputValues: updates,
      );

      if (!mounted) return;

      // Launch and navigate to chat
      final launched = await service.launchAgent(widget.agent.id);
      if (!mounted) return;

      ref.read(selectedAgentProvider.notifier).state = launched;
      ref.read(activeSandboxIdProvider.notifier).state =
          launched.sandboxIds.isNotEmpty ? launched.sandboxIds.first : null;
      context.go('/chat/${launched.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save: ${formatError(e)}')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  List<AgentRuntimeInput> get _userRequired =>
      _inputs.where((i) => i.isUserRequired).toList();

  List<AgentRuntimeInput> get _autoConfigured =>
      _inputs.where((i) => !i.isUserRequired).toList();

  int get _missingCount => _userRequired
      .where((i) => i.required && !i.isFilled)
      .length;

  void _updateInput(String key, String value) {
    setState(() {
      final idx = _inputs.indexWhere((i) => i.key == key);
      if (idx >= 0) _inputs[idx].value = value;
    });
  }

  // ── Build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final userRequired = _userRequired;
    final autoConfigured = _autoConfigured;
    final autoFilledCount = autoConfigured.where((i) => i.isFilled).length;

    return Scaffold(
      body: FadeTransition(
        opacity: _fadeAnimation,
        child: Column(
          children: [
            // ── Header ──
            _buildHeader(theme),

            // ── Body ──
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                children: [
                  // Required section
                  if (userRequired.isNotEmpty) ...[
                    _buildSectionHeader(
                      theme,
                      icon: LucideIcons.keyRound,
                      title: 'Required to Start',
                      count: userRequired.length,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'These credentials are unique to your account. '
                      'The agent can\'t function without them.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: RuhTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 16),
                    for (final input in userRequired)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _InputCard(
                          input: input,
                          onChanged: (v) => _updateInput(input.key, v),
                        ),
                      ),
                  ],

                  // No required inputs
                  if (userRequired.isEmpty && autoConfigured.isNotEmpty)
                    _buildAllSetBanner(theme),

                  // Auto-configured section
                  if (autoConfigured.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _buildAdvancedAccordion(
                      theme,
                      autoConfigured: autoConfigured,
                      autoFilledCount: autoFilledCount,
                    ),
                  ],
                ],
              ),
            ),

            // ── Footer ──
            _buildFooter(theme),
          ],
        ),
      ),
    );
  }

  // ── Header ───────────────────────────────────────────────────────────

  Widget _buildHeader(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: RuhTheme.cardColor,
        border: const Border(
          bottom: BorderSide(color: RuhTheme.borderDefault),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            children: [
              IconButton(
                onPressed: () => context.pop(),
                icon: const Icon(LucideIcons.arrowLeft, size: 20),
                color: RuhTheme.textTertiary,
              ),
              const SizedBox(width: 8),
              if (widget.agent.avatar.isNotEmpty)
                Text(
                  widget.agent.avatar,
                  style: const TextStyle(fontSize: 28),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Almost ready',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${widget.agent.name} needs a few things before it can start',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: RuhTheme.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Section header ───────────────────────────────────────────────────

  Widget _buildSectionHeader(
    ThemeData theme, {
    required IconData icon,
    required String title,
    required int count,
  }) {
    return Row(
      children: [
        Icon(icon, size: 16, color: RuhTheme.primary),
        const SizedBox(width: 8),
        Text(
          title.toUpperCase(),
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
            color: RuhTheme.textPrimary,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: RuhTheme.background,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: RuhTheme.borderDefault),
          ),
          child: Text(
            '$count',
            style: theme.textTheme.labelSmall?.copyWith(
              color: RuhTheme.textTertiary,
            ),
          ),
        ),
      ],
    );
  }

  // ── All set banner ───────────────────────────────────────────────────

  Widget _buildAllSetBanner(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: RuhTheme.success.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        border: Border.all(color: RuhTheme.success.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.checkCircle2, size: 20, color: RuhTheme.success),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No credentials needed',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'All settings have been auto-configured.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: RuhTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Advanced accordion ───────────────────────────────────────────────

  Widget _buildAdvancedAccordion(
    ThemeData theme, {
    required List<AgentRuntimeInput> autoConfigured,
    required int autoFilledCount,
  }) {
    return Column(
      children: [
        InkWell(
          onTap: () => setState(() => _advancedOpen = !_advancedOpen),
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: RuhTheme.cardColor,
              borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
              border: Border.all(color: RuhTheme.borderDefault),
            ),
            child: Row(
              children: [
                Icon(LucideIcons.sparkles, size: 16, color: RuhTheme.secondary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Smart Defaults',
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (_inferring)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: RuhTheme.secondary,
                      ),
                    ),
                  )
                else
                  Text(
                    '$autoFilledCount of ${autoConfigured.length} auto-configured',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: RuhTheme.textTertiary,
                    ),
                  ),
                const SizedBox(width: 4),
                AnimatedRotation(
                  turns: _advancedOpen ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(
                    LucideIcons.chevronDown,
                    size: 16,
                    color: RuhTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_advancedOpen)
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
            child: Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Column(
                children: [
                  for (final input in autoConfigured)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _InputCard(
                        input: input,
                        onChanged: (v) => _updateInput(input.key, v),
                        badge: input.populationStrategy == 'ai_inferred'
                            ? const _Badge(label: 'AI', color: RuhTheme.secondary)
                            : const _Badge(label: 'Default', color: RuhTheme.primary),
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────

  Widget _buildFooter(ThemeData theme) {
    final missing = _missingCount;

    return Container(
      decoration: BoxDecoration(
        color: RuhTheme.cardColor,
        border: const Border(
          top: BorderSide(color: RuhTheme.borderDefault),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            children: [
              TextButton.icon(
                onPressed: () => context.pop(),
                icon: const Icon(LucideIcons.arrowLeft, size: 16),
                label: const Text('Back'),
                style: TextButton.styleFrom(
                  foregroundColor: RuhTheme.textSecondary,
                ),
              ),
              const Spacer(),
              if (missing > 0)
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Text(
                    '$missing required input${missing == 1 ? '' : 's'} remaining',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: RuhTheme.textTertiary,
                    ),
                  ),
                ),
              if (missing == 0 && _userRequired.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Text(
                    'All set',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: RuhTheme.success,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(LucideIcons.arrowRight, size: 16),
                label: const Text('Save & Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Input Card ──────────────────────────────────────────────────────────────

class _Badge {
  final String label;
  final Color color;
  const _Badge({required this.label, required this.color});
}

class _InputCard extends StatelessWidget {
  final AgentRuntimeInput input;
  final ValueChanged<String> onChanged;
  final _Badge? badge;

  const _InputCard({
    required this.input,
    required this.onChanged,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filled = input.isFilled;
    final isDefaulted = input.value.trim().isEmpty &&
        (input.defaultValue?.trim().isNotEmpty ?? false);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: filled ? RuhTheme.cardColor : RuhTheme.warning.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(RuhTheme.radiusXxl),
        border: Border.all(
          color: filled
              ? RuhTheme.borderDefault
              : RuhTheme.warning.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            input.label.isNotEmpty ? input.label : input.key,
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (input.required && !filled)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Text('*',
                                style: TextStyle(color: RuhTheme.error)),
                          ),
                      ],
                    ),
                    if (input.description.isNotEmpty &&
                        !input.description.endsWith('required at runtime.'))
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          input.description,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: RuhTheme.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (badge != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: badge!.color.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(LucideIcons.sparkles,
                              size: 10, color: badge!.color),
                          const SizedBox(width: 4),
                          Text(
                            badge!.label,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: badge!.color,
                              fontWeight: FontWeight.w700,
                              fontSize: 10,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(width: 6),
                  _StatusBadge(
                    filled: filled,
                    isDefaulted: isDefaulted,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Input field
          _buildField(theme),
          // Default hint
          if (input.defaultValue != null &&
              input.inputType != 'boolean' &&
              input.inputType != 'select')
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Default: ${input.defaultValue}',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: RuhTheme.textTertiary,
                  fontFamily: 'monospace',
                  fontSize: 10,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildField(ThemeData theme) {
    if (input.inputType == 'boolean') {
      final isOn = input.effectiveValue == 'true' ||
          input.effectiveValue == '1' ||
          input.effectiveValue == 'yes';
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            isOn ? 'Enabled' : 'Disabled',
            style: theme.textTheme.bodySmall?.copyWith(
              color: RuhTheme.textSecondary,
            ),
          ),
          Switch.adaptive(
            value: isOn,
            activeTrackColor: RuhTheme.primary,
            onChanged: (v) => onChanged(v ? 'true' : 'false'),
          ),
        ],
      );
    }

    if (input.inputType == 'select' && (input.options?.isNotEmpty ?? false)) {
      return DropdownButtonFormField<String>(
        value: input.effectiveValue.isNotEmpty ? input.effectiveValue : null,
        decoration: InputDecoration(
          isDense: true,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
            borderSide: const BorderSide(color: RuhTheme.borderDefault),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
            borderSide: const BorderSide(color: RuhTheme.borderDefault),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
            borderSide: const BorderSide(color: RuhTheme.primary),
          ),
          filled: true,
          fillColor: RuhTheme.background,
        ),
        items: input.options!
            .map((opt) => DropdownMenuItem(value: opt, child: Text(opt)))
            .toList(),
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      );
    }

    return TextFormField(
      initialValue: input.value.isNotEmpty ? input.value : null,
      onChanged: onChanged,
      keyboardType:
          input.inputType == 'number' ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        hintText: input.example ?? input.defaultValue ?? input.key,
        hintStyle: theme.textTheme.bodyMedium?.copyWith(
          color: RuhTheme.textTertiary,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
          borderSide: const BorderSide(color: RuhTheme.borderDefault),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
          borderSide: const BorderSide(color: RuhTheme.borderDefault),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
          borderSide: const BorderSide(color: RuhTheme.primary),
        ),
        filled: true,
        fillColor: RuhTheme.background,
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final bool filled;
  final bool isDefaulted;

  const _StatusBadge({required this.filled, required this.isDefaulted});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final Color color;
    final String label;
    final IconData icon;

    if (filled) {
      if (isDefaulted) {
        color = RuhTheme.primary;
        label = 'DEFAULT';
        icon = LucideIcons.checkCircle2;
      } else {
        color = RuhTheme.success;
        label = 'SET';
        icon = LucideIcons.checkCircle2;
      }
    } else {
      color = RuhTheme.warning;
      label = 'NEEDED';
      icon = LucideIcons.alertCircle;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
              fontSize: 10,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}
