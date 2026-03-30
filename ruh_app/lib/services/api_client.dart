import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/api_config.dart';
import 'logger.dart';

/// Singleton HTTP client that wraps Dio with auth and SSE streaming support.
class ApiClient {
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

    _dio.interceptors.add(_AuthInterceptor(_storage));
    _dio.interceptors.add(_LoggingInterceptor());
  }

  static final ApiClient _instance = ApiClient._internal();

  /// Returns the shared [ApiClient] singleton.
  factory ApiClient() => _instance;

  late final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // ---------------------------------------------------------------------------
  // Standard HTTP helpers
  // ---------------------------------------------------------------------------

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.get<T>(path, queryParameters: queryParameters);
  }

  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.post<T>(path, data: data, queryParameters: queryParameters);
  }

  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return _dio.patch<T>(path, data: data, queryParameters: queryParameters);
  }

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
  Stream<String> streamPost(
    String path,
    Map<String, dynamic> data,
  ) async* {
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
  // Token management (delegates to secure storage)
  // ---------------------------------------------------------------------------

  /// Persist an access token (e.g. after login).
  Future<void> setAccessToken(String token) async {
    await _storage.write(key: _kAccessToken, value: token);
  }

  /// Remove the stored access token (e.g. on logout).
  Future<void> clearAccessToken() async {
    await _storage.delete(key: _kAccessToken);
  }

  /// Update the base URL at runtime (e.g. from settings).
  void updateBaseUrl(String url) {
    _dio.options.baseUrl = url;
    Log.i('ApiClient', 'Base URL updated to: $url');
  }

  static const String _kAccessToken = 'ruh_access_token';
}

// -----------------------------------------------------------------------------
// Auth interceptor
// -----------------------------------------------------------------------------

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._storage);

  final FlutterSecureStorage _storage;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: ApiClient._kAccessToken);
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

class _LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    Log.d('HTTP', '→ ${options.method} ${options.path}');
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    Log.i('HTTP', '← ${response.statusCode} ${response.requestOptions.method} ${response.requestOptions.path}');
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
    Log.e('HTTP', '✗ $status ${err.requestOptions.method} ${err.requestOptions.path}: $msg');
    handler.next(err);
  }
}
