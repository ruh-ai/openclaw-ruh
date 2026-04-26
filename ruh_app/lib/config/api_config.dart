/// Central API configuration for the Ruh.ai Flutter app.
///
/// Override [baseUrl] at build time with:
///   flutter run --dart-define=API_BASE_URL=https://api.ruh.ai
///   flutter build apk --dart-define=API_BASE_URL=https://api.ruh.ai
class ApiConfig {
  ApiConfig._();

  /// Default backend base URL from compile-time environment.
  static const String _defaultBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );

  /// Backend base URL. Defaults to localhost:8000 for local development.
  /// Override at build time via --dart-define=API_BASE_URL=<url>
  /// or at runtime via the Settings screen.
  static String baseUrl = _defaultBaseUrl;

  /// Timeout for long-running chat / SSE streams.
  static const Duration chatTimeout = Duration(seconds: 600);

  /// Timeout for normal REST calls.
  static const Duration restTimeout = Duration(seconds: 30);
}
