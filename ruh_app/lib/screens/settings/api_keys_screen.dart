import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';

/// Keys for persisting LLM provider API keys locally.
const _kOpenRouterKey = 'ruh_key_openrouter';
const _kOpenAiKey = 'ruh_key_openai';
const _kAnthropicKey = 'ruh_key_anthropic';
const _kGeminiKey = 'ruh_key_gemini';

class _ProviderConfig {
  final String label;
  final String storageKey;
  final String hint;
  final IconData icon;

  const _ProviderConfig({
    required this.label,
    required this.storageKey,
    required this.hint,
    required this.icon,
  });
}

final _providers = [
  _ProviderConfig(
    label: 'OpenRouter',
    storageKey: _kOpenRouterKey,
    hint: 'sk-or-...',
    icon: LucideIcons.network,
  ),
  _ProviderConfig(
    label: 'OpenAI',
    storageKey: _kOpenAiKey,
    hint: 'sk-...',
    icon: LucideIcons.brain,
  ),
  _ProviderConfig(
    label: 'Anthropic',
    storageKey: _kAnthropicKey,
    hint: 'sk-ant-...',
    icon: LucideIcons.sparkles,
  ),
  _ProviderConfig(
    label: 'Google Gemini',
    storageKey: _kGeminiKey,
    hint: 'AIza...',
    icon: LucideIcons.gem,
  ),
];

/// Screen for managing LLM provider API keys.
///
/// Keys are stored locally in SharedPreferences. They are sent to the
/// backend when creating or configuring agent sandboxes.
class ApiKeysScreen extends ConsumerStatefulWidget {
  const ApiKeysScreen({super.key});

  @override
  ConsumerState<ApiKeysScreen> createState() => _ApiKeysScreenState();
}

class _ApiKeysScreenState extends ConsumerState<ApiKeysScreen> {
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, bool> _obscured = {};
  bool _isLoading = true;
  bool _isSaving = false;
  bool _hasChanges = false;
  final Map<String, String> _originalValues = {};

  @override
  void initState() {
    super.initState();
    for (final p in _providers) {
      _controllers[p.storageKey] = TextEditingController();
      _obscured[p.storageKey] = true;
    }
    _loadKeys();
  }

  Future<void> _loadKeys() async {
    final prefs = await SharedPreferences.getInstance();
    for (final p in _providers) {
      final value = prefs.getString(p.storageKey) ?? '';
      _controllers[p.storageKey]!.text = value;
      _originalValues[p.storageKey] = value;
    }
    setState(() => _isLoading = false);
  }

  void _checkChanges() {
    bool changed = false;
    for (final p in _providers) {
      if (_controllers[p.storageKey]!.text != _originalValues[p.storageKey]) {
        changed = true;
        break;
      }
    }
    if (changed != _hasChanges) {
      setState(() => _hasChanges = changed);
    }
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);
    final prefs = await SharedPreferences.getInstance();
    for (final p in _providers) {
      final value = _controllers[p.storageKey]!.text.trim();
      if (value.isEmpty) {
        await prefs.remove(p.storageKey);
      } else {
        await prefs.setString(p.storageKey, value);
      }
      _originalValues[p.storageKey] = value;
    }
    setState(() {
      _isSaving = false;
      _hasChanges = false;
    });
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('API keys saved'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/settings'),
        ),
        title: const Text('API Keys'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: RuhTheme.info.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
                    border: Border.all(
                      color: RuhTheme.info.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        LucideIcons.info,
                        size: IconSizes.md,
                        color: RuhTheme.info,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'API keys are stored locally on this device and sent '
                          'to the backend when configuring agent sandboxes. '
                          'At least one key is required for agents to function.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: RuhTheme.textSecondary,
                            height: 1.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                for (final p in _providers) ...[
                  Text(
                    p.label,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _controllers[p.storageKey],
                    obscureText: _obscured[p.storageKey]!,
                    onChanged: (_) => _checkChanges(),
                    decoration: InputDecoration(
                      hintText: p.hint,
                      hintStyle: TextStyle(color: RuhTheme.textTertiary),
                      prefixIcon: Icon(
                        p.icon,
                        size: IconSizes.md,
                        color: RuhTheme.textTertiary,
                      ),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscured[p.storageKey]!
                              ? LucideIcons.eyeOff
                              : LucideIcons.eye,
                          size: IconSizes.sm,
                          color: RuhTheme.textTertiary,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscured[p.storageKey] =
                                !_obscured[p.storageKey]!;
                          });
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                const SizedBox(height: 12),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _hasChanges && !_isSaving ? _save : null,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Icon(LucideIcons.save, size: IconSizes.md),
                    label: Text(_isSaving ? 'Saving...' : 'Save Keys'),
                  ),
                ),
              ],
            ),
    );
  }
}
