import 'dart:async';

import 'package:app_links/app_links.dart';

import 'logger.dart';

/// Handles deep links from external sources (e.g., ruh://chat/agentId).
///
/// URL scheme: `ruh://` for all platforms.
/// Web uses standard path-based routing via GoRouter.
class DeepLinkService {
  static final DeepLinkService _instance = DeepLinkService._();
  factory DeepLinkService() => _instance;
  DeepLinkService._();

  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;

  /// Callback to navigate the app to a given route path.
  /// Set this from the router layer.
  static void Function(String route)? onNavigate;

  /// Initialize the deep link listener and handle the initial link.
  void init() {
    // Handle link that launched the app
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) {
        _handleUri(uri);
      }
    }).catchError((e) {
      Log.w('DeepLinks', 'No initial deep link: $e');
    });

    // Listen for subsequent links while app is running
    _subscription = _appLinks.uriLinkStream.listen(
      _handleUri,
      onError: (e) {
        Log.e('DeepLinks', 'Deep link stream error', e);
      },
    );
  }

  void _handleUri(Uri uri) {
    Log.i('DeepLinks', 'Received deep link: $uri');

    // Supported formats:
    //   ruh://chat/<agentId>       → /chat/<agentId>
    //   ruh://agents/<agentId>     → /agents/<agentId>
    //   ruh://marketplace          → /marketplace
    //   ruh://marketplace/<slug>   → /marketplace/<slug>
    //   ruh://settings             → /settings
    final path = uri.path.startsWith('/') ? uri.path : '/${uri.path}';
    final host = uri.host;

    // Combine host and path: ruh://chat/123 → host="chat", path="/123"
    String route;
    if (host.isNotEmpty) {
      route = '/$host$path';
    } else {
      route = path;
    }

    // Clean up double slashes
    route = route.replaceAll('//', '/');
    if (route.isEmpty || route == '/') route = '/';

    Log.i('DeepLinks', 'Navigating to: $route');
    onNavigate?.call(route);
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
  }
}
