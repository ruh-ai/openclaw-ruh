/// Central API configuration for the Ruh.ai Flutter app.
///
/// Override [baseUrl] at build time with:
///   flutter run --dart-define=API_BASE_URL=https://api.ruh.ai
///   flutter build apk --dart-define=API_BASE_URL=https://api.ruh.ai
class ApiConfig {
  ApiConfig._();

  /// Backend base URL. Defaults to localhost:8000 for local development.
  /// Override at build time via --dart-define=API_BASE_URL=<url>.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );

  /// Timeout for long-running chat / SSE streams.
  static const Duration chatTimeout = Duration(seconds: 600);

  /// Timeout for normal REST calls.
  static const Duration restTimeout = Duration(seconds: 30);
}
