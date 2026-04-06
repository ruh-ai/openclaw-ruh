import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../config/api_config.dart';
import 'access_token_store.dart';
import 'logger.dart';

abstract class BackendClient {
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  });

  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  });

  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  });

  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  });

  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  });

  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  });

  Stream<String> streamPost(String path, Map<String, dynamic> data);

  Stream<String> streamGet(String path);

  Future<void> setAccessToken(String token);
  Future<String?> getAccessToken();
  Future<void> clearAccessToken();
  Future<void> setRefreshToken(String token);
  Future<String?> getRefreshToken();
  Future<void> clearRefreshToken();
}

/// Singleton HTTP client that wraps Dio with auth and SSE streaming support.
class ApiClient implements BackendClient {
  ApiClient._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        connectTimeout: ApiConfig.restTimeout,
        receiveTimeout: ApiConfig.restTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );

    _dio.interceptors.add(_AuthInterceptor(_dio, _tokenStore));
    _dio.interceptors.add(_LoggingInterceptor());
  }

  static final ApiClient _instance = ApiClient._internal();

  /// Returns the shared [ApiClient] singleton.
  factory ApiClient() => _instance;

  late final Dio _dio;
  final AccessTokenStore _tokenStore = AccessTokenStore();

  // ---------------------------------------------------------------------------
  // Standard HTTP helpers
  // ---------------------------------------------------------------------------

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get<T>(path, queryParameters: queryParameters);
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get<List<int>>(
      path,
      queryParameters: queryParameters,
      options: Options(responseType: ResponseType.bytes),
    );
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.post<T>(path, data: data, queryParameters: queryParameters);
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.post<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: Options(
        receiveTimeout: ApiConfig.chatTimeout,
        sendTimeout: ApiConfig.chatTimeout,
      ),
    );
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.patch<T>(path, data: data, queryParameters: queryParameters);
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.delete<T>(path, data: data, queryParameters: queryParameters);
  }

  // ---------------------------------------------------------------------------
  // SSE streaming POST (for chat)
  // ---------------------------------------------------------------------------

  /// Sends a POST request and yields each SSE line from the response stream.
  ///
  /// The caller is responsible for parsing event/data semantics; this method
  /// yields raw, non-empty lines as they arrive.
  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) async* {
    final response = await _dio.post<ResponseBody>(
      path,
      data: data,
      options: Options(
        responseType: ResponseType.stream,
        receiveTimeout: ApiConfig.chatTimeout,
        headers: {'Accept': 'text/event-stream'},
      ),
    );

    final stream = response.data?.stream;
    if (stream == null) return;

    // SSE streams are UTF-8 text; accumulate partial lines across chunks.
    String buffer = '';
    await for (final chunk in stream) {
      buffer += utf8.decode(chunk, allowMalformed: true);
      final lines = buffer.split('\n');
      // The last element may be an incomplete line — keep it in the buffer.
      buffer = lines.removeLast();
      for (final line in lines) {
        final trimmed = line.trim();
        if (trimmed.isNotEmpty) {
          yield trimmed;
        }
      }
    }

    // Flush any remaining content in the buffer.
    if (buffer.trim().isNotEmpty) {
      yield buffer.trim();
    }
  }

  // ---------------------------------------------------------------------------
  // SSE streaming GET (for forge progress, etc.)
  // ---------------------------------------------------------------------------

  /// Sends a GET request and yields each SSE line from the response stream.
  ///
  /// Same semantics as [streamPost] but uses the GET method, which is needed
  /// for endpoints like the forge progress stream.
  @override
  Stream<String> streamGet(String path) async* {
    final response = await _dio.get<ResponseBody>(
      path,
      options: Options(
        responseType: ResponseType.stream,
        receiveTimeout: ApiConfig.chatTimeout,
        headers: {'Accept': 'text/event-stream'},
      ),
    );

    final stream = response.data?.stream;
    if (stream == null) return;

    String buffer = '';
    await for (final chunk in stream) {
      buffer += utf8.decode(chunk, allowMalformed: true);
      final lines = buffer.split('\n');
      buffer = lines.removeLast();
      for (final line in lines) {
        final trimmed = line.trim();
        if (trimmed.isNotEmpty) {
          yield trimmed;
        }
      }
    }

    if (buffer.trim().isNotEmpty) {
      yield buffer.trim();
    }
  }

  // ---------------------------------------------------------------------------
  // Token management (delegates to secure storage)
  // ---------------------------------------------------------------------------

  /// Persist an access token (e.g. after login).
  @override
  Future<void> setAccessToken(String token) async {
    await _tokenStore.write(token);
  }

  @override
  Future<String?> getAccessToken() async {
    return _tokenStore.read();
  }

  /// Remove the stored access token (e.g. on logout).
  @override
  Future<void> clearAccessToken() async {
    await _tokenStore.clear();
  }

  @override
  Future<void> setRefreshToken(String token) async {
    await _tokenStore.writeRefreshToken(token);
  }

  @override
  Future<String?> getRefreshToken() async {
    return _tokenStore.readRefreshToken();
  }

  @override
  Future<void> clearRefreshToken() async {
    await _tokenStore.clearRefreshToken();
  }

  /// Update the base URL at runtime (e.g. from settings).
  void updateBaseUrl(String url) {
    _dio.options.baseUrl = url;
    Log.i('ApiClient', 'Base URL updated to: $url');
  }
}

// -----------------------------------------------------------------------------
// Auth interceptor
// -----------------------------------------------------------------------------

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._dio, this._tokenStore);

  static const String _authRetryFlag = '__ruh_auth_retry';
  static const String _refreshRequestFlag = '__ruh_is_refresh_request';

  final Dio _dio;
  final AccessTokenStore _tokenStore;
  Future<bool>? _refreshInFlight;

  bool _isRefreshRequest(RequestOptions options) {
    if (options.extra[_refreshRequestFlag] == true) return true;
    return options.path.endsWith('/api/auth/refresh');
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (_isRefreshRequest(options)) {
      handler.next(options);
      return;
    }

    final token = await _tokenStore.read();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final statusCode = err.response?.statusCode;
    final shouldRefresh =
        (statusCode == 401 || statusCode == 403) &&
        err.requestOptions.extra[_authRetryFlag] != true &&
        !_isRefreshRequest(err.requestOptions);

    if (!shouldRefresh) {
      handler.next(err);
      return;
    }

    final refreshed = await _attemptTokenRefresh();
    if (!refreshed) {
      await _tokenStore.clear();
      await _tokenStore.clearRefreshToken();
      handler.next(err);
      return;
    }

    final request = err.requestOptions;
    request.headers['Authorization'] = 'Bearer ${(await _tokenStore.read())}';
    request.extra[_authRetryFlag] = true;

    try {
      final response = await _dio.fetch<dynamic>(request);
      handler.resolve(response);
    } catch (error) {
      if (error is DioException) {
        final refreshStatus = error.response?.statusCode;
        if (refreshStatus == 401 || refreshStatus == 403) {
          await _tokenStore.clear();
          await _tokenStore.clearRefreshToken();
        }
        handler.next(error);
        return;
      }
      handler.next(err);
    }
  }

  Future<bool> _attemptTokenRefresh() async {
    if (_refreshInFlight != null) return _refreshInFlight!;

    final completer = Completer<bool>();
    _refreshInFlight = completer.future;

    try {
      final refreshToken = await _tokenStore.readRefreshToken();
      if (refreshToken == null || refreshToken.isEmpty) {
        completer.complete(false);
        return false;
      }

      final response = await _dio.post<dynamic>(
        '/api/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(
          extra: {_refreshRequestFlag: true},
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (response.statusCode != 200 || response.data == null) {
        completer.complete(false);
        return false;
      }

      if (response.data is Map<String, dynamic>) {
        final responseData = response.data as Map<String, dynamic>;
        final nextAccessToken = responseData['accessToken'];
        final nextRefreshToken = responseData['refreshToken'];
        if (nextAccessToken is String && nextAccessToken.isNotEmpty) {
          await _tokenStore.write(nextAccessToken);
        }
        if (nextRefreshToken is String && nextRefreshToken.isNotEmpty) {
          await _tokenStore.writeRefreshToken(nextRefreshToken);
        }
        completer.complete(true);
        return true;
      }

      completer.complete(false);
      return false;
    } on DioException {
      await _tokenStore.clear();
      await _tokenStore.clearRefreshToken();
      completer.complete(false);
      return false;
    } catch (error) {
      Log.e('ApiClient', 'Token refresh failed', error);
      completer.complete(false);
      return false;
    } finally {
      _refreshInFlight = null;
    }
  }
}

class _LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    Log.d('HTTP', '→ ${options.method} ${options.path}');
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    Log.i(
      'HTTP',
      '← ${response.statusCode} ${response.requestOptions.method} ${response.requestOptions.path}',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final status = err.response?.statusCode ?? 0;
    final msg = err.type == DioExceptionType.connectionTimeout
        ? 'Connection timeout'
        : err.type == DioExceptionType.connectionError
        ? 'Connection refused — is the backend running?'
        : err.message ?? err.type.name;
    Log.e(
      'HTTP',
      '✗ $status ${err.requestOptions.method} ${err.requestOptions.path}: $msg',
    );
    handler.next(err);
  }
}
