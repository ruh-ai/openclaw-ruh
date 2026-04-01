/// Central API configuration for the Ruh.ai Flutter app.
class ApiConfig {
  ApiConfig._();

  /// Backend base URL. Override at runtime for staging / production.
  static String baseUrl = 'http://localhost:8000';

  /// Timeout for long-running chat / SSE streams.
  static const Duration chatTimeout = Duration(seconds: 600);

  /// Timeout for normal REST calls.
  static const Duration restTimeout = Duration(seconds: 30);
}
