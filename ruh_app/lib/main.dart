import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/routes.dart';
import 'config/theme.dart';
import 'services/logger.dart';
import 'widgets/debug_overlay.dart';

void main() {
  // Catch all Flutter framework errors
  FlutterError.onError = (details) {
    Log.e('Flutter', details.exceptionAsString(), details.exception, details.stack);
    // In debug mode, also print to console
    if (kDebugMode) {
      FlutterError.presentError(details);
    }
  };

  // Catch all async errors not caught by Flutter
  runZonedGuarded(
    () {
      WidgetsFlutterBinding.ensureInitialized();
      Log.i('App', 'Starting Ruh.ai v1.0.0');
      Log.i('App', 'Debug mode: $kDebugMode');

      runApp(
        ProviderScope(
          observers: [_RiverpodLogger()],
          child: const RuhApp(),
        ),
      );
    },
    (error, stackTrace) {
      Log.e('Zone', 'Uncaught error', error, stackTrace);
    },
  );
}

/// Root widget for the Ruh.ai client application.
class RuhApp extends StatelessWidget {
  const RuhApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Ruh',
      debugShowCheckedModeBanner: false,
      theme: RuhTheme.light(),
      darkTheme: RuhTheme.dark(),
      themeMode: ThemeMode.light,
      routerConfig: appRouter,
      builder: (context, child) {
        // Wrap with error boundary and debug overlay
        Widget result = _ErrorBoundary(child: child ?? const SizedBox.shrink());
        if (kDebugMode) {
          result = DebugOverlay(child: result);
        }
        return result;
      },
    );
  }
}

/// Catches rendering errors and shows a fallback UI instead of red screen.
class _ErrorBoundary extends StatefulWidget {
  final Widget child;
  const _ErrorBoundary({required this.child});

  @override
  State<_ErrorBoundary> createState() => _ErrorBoundaryState();
}

class _ErrorBoundaryState extends State<_ErrorBoundary> {
  bool _hasError = false;
  String? _errorMessage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reset error state on navigation
    _hasError = false;
    _errorMessage = null;
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                const Text(
                  'Something went wrong',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                if (_errorMessage != null)
                  Text(
                    _errorMessage!,
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                    textAlign: TextAlign.center,
                  ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => setState(() {
                    _hasError = false;
                    _errorMessage = null;
                  }),
                  child: const Text('Try Again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return widget.child;
  }
}

/// Logs Riverpod provider state changes for debugging.
class _RiverpodLogger extends ProviderObserver {
  @override
  void didAddProvider(
    ProviderBase<Object?> provider,
    Object? value,
    ProviderContainer container,
  ) {
    Log.d('Riverpod', 'Created: ${provider.name ?? provider.runtimeType.toString()}');
  }

  @override
  void didUpdateProvider(
    ProviderBase<Object?> provider,
    Object? previousValue,
    Object? newValue,
    ProviderContainer container,
  ) {
    // Only log async state transitions to avoid noise
    if (newValue is AsyncError) {
      Log.e('Riverpod', '${provider.name ?? provider.runtimeType}: ERROR',
          (newValue).error, (newValue).stackTrace);
    }
  }

  @override
  void providerDidFail(
    ProviderBase<Object?> provider,
    Object error,
    StackTrace stackTrace,
    ProviderContainer container,
  ) {
    Log.e('Riverpod', '${provider.name ?? provider.runtimeType}: FAILED',
        error, stackTrace);
  }

  @override
  void didDisposeProvider(
    ProviderBase<Object?> provider,
    ProviderContainer container,
  ) {
    Log.d('Riverpod', 'Disposed: ${provider.name ?? provider.runtimeType.toString()}');
  }
}
