import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/api_config.dart';
import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../models/auth_session.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../utils/error_formatter.dart';

/// Key used to persist the backend URL in SharedPreferences.
const String _kBackendUrlKey = 'ruh_backend_url';

/// Functional settings screen with backend URL configuration,
/// connection testing, and theme selection.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final TextEditingController _urlController = TextEditingController();
  _ConnectionStatus _connectionStatus = _ConnectionStatus.idle;
  String? _connectionMessage;
  bool _isSaving = false;
  bool _isSwitchingOrganization = false;

  @override
  void initState() {
    super.initState();
    _urlController.text = ApiConfig.baseUrl;
    _loadPersistedUrl();
  }

  Future<void> _loadPersistedUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_kBackendUrlKey);
    if (savedUrl != null && savedUrl.isNotEmpty) {
      _urlController.text = savedUrl;
      ApiConfig.baseUrl = savedUrl;
    }
  }

  Future<void> _testConnection() async {
    setState(() {
      _connectionStatus = _ConnectionStatus.testing;
      _connectionMessage = null;
    });

    final url = _urlController.text.trim();
    if (url.isEmpty) {
      setState(() {
        _connectionStatus = _ConnectionStatus.failure;
        _connectionMessage = 'Please enter a backend URL';
      });
      return;
    }

    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: url,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );
      final response = await dio.get('/api/sandboxes');
      if (response.statusCode != null && response.statusCode! < 400) {
        setState(() {
          _connectionStatus = _ConnectionStatus.success;
          _connectionMessage = 'Connected successfully';
        });
      } else {
        setState(() {
          _connectionStatus = _ConnectionStatus.failure;
          _connectionMessage = 'Server returned ${response.statusCode}';
        });
      }
    } catch (e) {
      setState(() {
        _connectionStatus = _ConnectionStatus.failure;
        _connectionMessage = formatError(e);
      });
    }
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);

    final url = _urlController.text.trim();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kBackendUrlKey, url);
    ApiConfig.baseUrl = url;

    setState(() => _isSaving = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Settings saved'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final themeModeAsync = ref.watch(themeModeProvider);
    final themeMode = themeModeAsync.valueOrNull ?? ThemeMode.light;
    final authState = ref.watch(authControllerProvider);
    final session = authState.session;
    final customerMemberships =
        session?.memberships
            .where(
              (membership) =>
                  membership.organizationKind == 'customer' &&
                  membership.status == 'active' &&
                  (membership.role == 'owner' ||
                      membership.role == 'admin' ||
                      membership.role == 'employee'),
            )
            .toList() ??
        const [];

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SettingsHeroCard(session: session),
          const SizedBox(height: 20),

          // -- Account section --
          const _SectionHeader(title: 'Account'),
          _SettingsTile(
            icon: LucideIcons.user,
            title: 'Profile',
            subtitle: session == null
                ? 'Manage your account'
                : '${session.user.email} • ${session.activeOrganization?.name ?? 'No organization'}',
            onTap: () {},
          ),
          if (customerMemberships.length > 1)
            Card(
              margin: const EdgeInsets.only(bottom: 16),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Active Organization',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: session?.activeOrganization?.id,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(LucideIcons.building2),
                      ),
                      items: customerMemberships
                          .map(
                            (membership) => DropdownMenuItem<String>(
                              value: membership.organizationId,
                              child: Text(membership.organizationName),
                            ),
                          )
                          .toList(),
                      onChanged: (session?.refreshToken ?? '').isEmpty ||
                              _isSwitchingOrganization
                          ? null
                          : (organizationId) async {
                              final messenger = ScaffoldMessenger.of(context);
                              if (organizationId == null ||
                                  organizationId ==
                                      session?.activeOrganization?.id) {
                                return;
                              }

                              setState(() => _isSwitchingOrganization = true);
                              final success = await ref
                                  .read(authControllerProvider.notifier)
                                  .switchOrganization(organizationId);
                              if (!mounted) {
                                return;
                              }
                              setState(
                                () => _isSwitchingOrganization = false,
                              );
                              messenger.showSnackBar(
                                SnackBar(
                                  content: Text(
                                    success
                                        ? 'Active organization updated'
                                        : 'Could not switch organization',
                                  ),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            },
                    ),
                    if ((session?.refreshToken ?? '').isEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Switching organizations is available after a fresh sign-in.',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: RuhTheme.textTertiary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          _SettingsTile(
            icon: LucideIcons.key,
            title: 'API Keys',
            subtitle: 'Manage LLM provider keys',
            onTap: () {},
          ),
          const SizedBox(height: 24),
          _SettingsTile(
            icon: LucideIcons.logOut,
            title: 'Sign out',
            subtitle: 'Clear the local session on this device',
            onTap: () async {
              await ref.read(authControllerProvider.notifier).logout();
            },
          ),
          const SizedBox(height: 24),

          // -- Appearance section --
          const _SectionHeader(title: 'Appearance'),
          Card(
            margin: const EdgeInsets.only(bottom: 16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Theme',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(
                        value: ThemeMode.light,
                        icon: Icon(LucideIcons.sun, size: IconSizes.md),
                        label: Text('Light'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.dark,
                        icon: Icon(LucideIcons.moon, size: IconSizes.md),
                        label: Text('Dark'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.system,
                        icon: Icon(LucideIcons.monitor, size: IconSizes.md),
                        label: Text('System'),
                      ),
                    ],
                    selected: {themeMode},
                    onSelectionChanged: (selected) {
                      ref
                          .read(themeModeProvider.notifier)
                          .setThemeMode(selected.first);
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // -- Advanced section --
          const _SectionHeader(title: 'Advanced'),
          Card(
            margin: const EdgeInsets.only(bottom: 16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Backend URL',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _urlController,
                    decoration: InputDecoration(
                      hintText: 'http://localhost:8000',
                      hintStyle: TextStyle(color: RuhTheme.textTertiary),
                      prefixIcon: Icon(
                        LucideIcons.server,
                        size: IconSizes.md,
                        color: RuhTheme.textTertiary,
                      ),
                    ),
                    keyboardType: TextInputType.url,
                    onChanged: (_) {
                      if (_connectionStatus != _ConnectionStatus.idle) {
                        setState(() {
                          _connectionStatus = _ConnectionStatus.idle;
                          _connectionMessage = null;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 12),

                  // Connection status indicator
                  if (_connectionStatus != _ConnectionStatus.idle)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        children: [
                          if (_connectionStatus == _ConnectionStatus.testing)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 1.5,
                              ),
                            )
                          else
                            Icon(
                              _connectionStatus == _ConnectionStatus.success
                                  ? LucideIcons.checkCircle
                                  : LucideIcons.xCircle,
                              size: IconSizes.sm,
                              color:
                                  _connectionStatus == _ConnectionStatus.success
                                  ? RuhTheme.success
                                  : RuhTheme.error,
                            ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _connectionMessage ?? '',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color:
                                    _connectionStatus ==
                                        _ConnectionStatus.success
                                    ? RuhTheme.success
                                    : _connectionStatus ==
                                          _ConnectionStatus.failure
                                    ? RuhTheme.error
                                    : RuhTheme.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Test Connection button
                  OutlinedButton.icon(
                    onPressed: _connectionStatus == _ConnectionStatus.testing
                        ? null
                        : _testConnection,
                    icon: const Icon(LucideIcons.wifi, size: IconSizes.sm),
                    label: const Text('Test Connection'),
                  ),
                ],
              ),
            ),
          ),

          // -- About section --
          const _SectionHeader(title: 'About'),
          _SettingsTile(
            icon: LucideIcons.info,
            title: 'Version',
            subtitle: '1.0.0',
            onTap: () {},
          ),
          const SizedBox(height: 32),

          // -- Save button --
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isSaving ? null : _save,
              icon: _isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(LucideIcons.save, size: IconSizes.md),
              label: Text(_isSaving ? 'Saving...' : 'Save Settings'),
            ),
          ),

          const SizedBox(height: 32),

          // Version footer
          Center(
            child: Text(
              'Ruh.ai',
              style: theme.textTheme.bodySmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsHeroCard extends StatelessWidget {
  final AuthSession? session;

  const _SettingsHeroCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final organizationName = session?.activeOrganization?.name ?? 'No organization';
    final email = session?.user.email ?? 'Signed out';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: RuhTheme.brandGradient,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: RuhTheme.primary.withValues(alpha: 0.14),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              'Customer workspace settings',
              style: theme.textTheme.labelMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            organizationName,
            style: theme.textTheme.headlineLarge?.copyWith(
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            email,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.88),
            ),
          ),
        ],
      ),
    );
  }
}

enum _ConnectionStatus { idle, testing, success, failure }

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.titleSmall?.copyWith(color: RuhTheme.textSecondary),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, size: IconSizes.lg, color: RuhTheme.primary),
        title: Text(title, style: theme.textTheme.bodyMedium),
        subtitle: Text(subtitle, style: theme.textTheme.bodySmall),
        trailing: Icon(
          LucideIcons.chevronRight,
          size: IconSizes.md,
          color: RuhTheme.textTertiary,
        ),
        onTap: onTap,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        ),
      ),
    );
  }
}
