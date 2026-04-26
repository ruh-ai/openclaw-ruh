import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:tray_manager/tray_manager.dart';

import 'logger.dart';

/// System tray integration for desktop platforms (macOS, Windows, Linux).
///
/// Shows a tray icon with a context menu for quick access to the app.
/// On non-desktop platforms or web, all methods are no-ops.
class SystemTrayService with TrayListener {
  static final SystemTrayService _instance = SystemTrayService._();
  factory SystemTrayService() => _instance;
  SystemTrayService._();

  bool _initialized = false;

  /// Callback to show/focus the main app window.
  void Function()? onShowApp;

  /// Callback to quit the app.
  void Function()? onQuit;

  /// Initialize the system tray. No-op on non-desktop or web platforms.
  Future<void> init() async {
    if (kIsWeb || _initialized) return;
    if (!(Platform.isMacOS || Platform.isWindows || Platform.isLinux)) return;

    try {
      trayManager.addListener(this);

      // Use a bundled tray icon or fallback
      await trayManager.setIcon(_trayIconPath);

      await trayManager.setToolTip('Ruh.ai');

      await _updateMenu();

      _initialized = true;
      Log.i('SystemTray', 'System tray initialized');
    } catch (e, st) {
      Log.e('SystemTray', 'Failed to initialize system tray', e, st);
    }
  }

  /// Update the tray menu with current agent health status.
  Future<void> updateHealthStatus({
    int healthy = 0,
    int unhealthy = 0,
  }) async {
    if (!_initialized) return;
    await _updateMenu(healthy: healthy, unhealthy: unhealthy);
  }

  Future<void> _updateMenu({int healthy = 0, int unhealthy = 0}) async {
    final healthLabel = healthy > 0 || unhealthy > 0
        ? '$healthy healthy, $unhealthy unhealthy'
        : 'No agents running';

    final menu = Menu(
      items: [
        MenuItem(key: 'show', label: 'Open Ruh'),
        MenuItem.separator(),
        MenuItem(key: 'status', label: healthLabel, disabled: true),
        MenuItem.separator(),
        MenuItem(key: 'quit', label: 'Quit Ruh'),
      ],
    );
    await trayManager.setContextMenu(menu);
  }

  @override
  void onTrayIconMouseDown() {
    onShowApp?.call();
  }

  @override
  void onTrayIconRightMouseDown() {
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'show':
        onShowApp?.call();
        break;
      case 'quit':
        onQuit?.call();
        break;
    }
  }

  /// Dispose the tray listener.
  void dispose() {
    if (_initialized) {
      trayManager.removeListener(this);
      _initialized = false;
    }
  }

  String get _trayIconPath {
    if (Platform.isMacOS) {
      return 'assets/icon/tray_icon.png';
    } else if (Platform.isWindows) {
      return 'assets/icon/tray_icon.ico';
    }
    return 'assets/icon/tray_icon.png';
  }
}
