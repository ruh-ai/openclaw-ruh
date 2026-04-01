import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/api_config.dart';
import '../../config/theme.dart';

/// Key used to persist the backend URL in SharedPreferences.
const String _kBackendUrlKey = 'ruh_backend_url';

/// Key used to persist the theme mode in SharedPreferences.
const String _kThemeModeKey = 'ruh_theme_mode';

/// Functional settings screen with backend URL configuration,
/// connection testing, and theme selection.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final TextEditingController _urlController = TextEditingController();
  _ConnectionStatus _connectionStatus = _ConnectionStatus.idle;
  String? _connectionMessage;
  bool _isSaving = false;
  ThemeMode _themeMode = ThemeMode.light;

  @override
  void initState() {
    super.initState();
    _urlController.text = ApiConfig.baseUrl;
    _loadPersistedSettings();
  }

  Future<void> _loadPersistedSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString(_kBackendUrlKey);
    if (savedUrl != null && savedUrl.isNotEmpty) {
      _urlController.text = savedUrl;
      ApiConfig.baseUrl = savedUrl;
    }
    final savedTheme = prefs.getString(_kThemeModeKey);
    if (savedTheme != null) {
      setState(() {
        _themeMode = _themeModeFromString(savedTheme);
      });
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
      final dio = Dio(BaseOptions(
        baseUrl: url,
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 5),
      ));
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
    } on DioException catch (e) {
      setState(() {
        _connectionStatus = _ConnectionStatus.failure;
        _connectionMessage = e.type == DioExceptionType.connectionTimeout
            ? 'Connection timed out'
            : e.type == DioExceptionType.connectionError
                ? 'Could not reach server'
                : e.message ?? 'Connection failed';
      });
    } catch (e) {
      setState(() {
        _connectionStatus = _ConnectionStatus.failure;
        _connectionMessage = e.toString();
      });
    }
  }

  Future<void> _save() async {
    setState(() => _isSaving = true);

    final url = _urlController.text.trim();
    final prefs = await SharedPreferences.getInstance();

    // Save backend URL
    await prefs.setString(_kBackendUrlKey, url);
    ApiConfig.baseUrl = url;

    // Save theme mode
    await prefs.setString(_kThemeModeKey, _themeModeToString(_themeMode));

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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // -- Backend Connection section --
          _SectionHeader(title: 'Backend Connection'),
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
                        size: 16,
                        color: RuhTheme.textTertiary,
                      ),
                    ),
                    keyboardType: TextInputType.url,
                    onChanged: (_) {
                      // Reset connection status when URL changes
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
                              size: 14,
                              color: _connectionStatus ==
                                      _ConnectionStatus.success
                                  ? RuhTheme.success
                                  : RuhTheme.error,
                            ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _connectionMessage ?? '',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: _connectionStatus ==
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
                    icon: const Icon(LucideIcons.wifi, size: 14),
                    label: const Text('Test Connection'),
                  ),
                ],
              ),
            ),
          ),

          // -- Appearance section --
          _SectionHeader(title: 'Appearance'),
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
                        icon: Icon(LucideIcons.sun, size: 16),
                        label: Text('Light'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.dark,
                        icon: Icon(LucideIcons.moon, size: 16),
                        label: Text('Dark'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.system,
                        icon: Icon(LucideIcons.monitor, size: 16),
                        label: Text('System'),
                      ),
                    ],
                    selected: {_themeMode},
                    onSelectionChanged: (selected) {
                      setState(() => _themeMode = selected.first);
                    },
                  ),
                ],
              ),
            ),
          ),

          // -- Account section --
          _SectionHeader(title: 'Account'),
          _SettingsTile(
            icon: LucideIcons.user,
            title: 'Profile',
            subtitle: 'Manage your account',
            onTap: () {},
          ),
          _SettingsTile(
            icon: LucideIcons.key,
            title: 'API Keys',
            subtitle: 'Manage LLM provider keys',
            onTap: () {},
          ),
          const SizedBox(height: 24),

          // -- About section --
          _SectionHeader(title: 'About'),
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
                  : const Icon(LucideIcons.save, size: 16),
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

enum _ConnectionStatus { idle, testing, success, failure }

String _themeModeToString(ThemeMode mode) {
  switch (mode) {
    case ThemeMode.light:
      return 'light';
    case ThemeMode.dark:
      return 'dark';
    case ThemeMode.system:
      return 'system';
  }
}

ThemeMode _themeModeFromString(String value) {
  switch (value) {
    case 'dark':
      return ThemeMode.dark;
    case 'system':
      return ThemeMode.system;
    default:
      return ThemeMode.light;
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: RuhTheme.textSecondary,
            ),
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
        leading: Icon(icon, size: 20, color: RuhTheme.primary),
        title: Text(title, style: theme.textTheme.bodyMedium),
        subtitle: Text(subtitle, style: theme.textTheme.bodySmall),
        trailing: Icon(
          LucideIcons.chevronRight,
          size: 16,
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
