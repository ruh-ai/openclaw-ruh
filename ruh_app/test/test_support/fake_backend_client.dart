import 'package:dio/dio.dart';
import 'package:ruh_app/services/api_client.dart';

/// A test double for [BackendClient] that returns canned responses and records
/// the last request path, body, and query parameters for assertion.
class FakeBackendClient implements BackendClient {
  // ---- canned response data ----
  dynamic getResponseData;
  dynamic postResponseData;
  dynamic patchResponseData;
  dynamic deleteResponseData;

  // ---- canned errors (throw if non-null) ----
  Object? getError;
  Object? postError;
  Object? patchError;
  Object? deleteError;

  // ---- recorded request details ----
  String? lastGetPath;
  String? lastPostPath;
  String? lastPatchPath;
  String? lastDeletePath;

  Object? lastPostBody;
  Object? lastPatchBody;
  Object? lastDeleteBody;

  Map<String, dynamic>? lastGetQuery;
  Map<String, dynamic>? lastPostQuery;

  // ---- token storage ----
  String? storedToken;
  String? storedRefreshToken;

  // ---- SSE stream stubs ----
  List<String>? streamPostLines;
  List<String>? streamGetLines;

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    lastGetQuery = queryParameters;
    if (getError != null) throw getError!;
    return Response<T>(
      data: getResponseData as T?,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastPostPath = path;
    lastPostBody = data;
    lastPostQuery = queryParameters;
    if (postError != null) throw postError!;
    return Response<T>(
      data: postResponseData as T?,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    return post<T>(path, data: data, queryParameters: queryParameters);
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastPatchPath = path;
    lastPatchBody = data;
    if (patchError != null) throw patchError!;
    return Response<T>(
      data: patchResponseData as T?,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastDeletePath = path;
    lastDeleteBody = data;
    if (deleteError != null) throw deleteError!;
    return Response<T>(
      data: deleteResponseData as T?,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  // ---------------------------------------------------------------------------
  // SSE streams
  // ---------------------------------------------------------------------------

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) async* {
    lastPostPath = path;
    lastPostBody = data;
    if (streamPostLines != null) {
      for (final line in streamPostLines!) {
        yield line;
      }
    }
  }

  @override
  Stream<String> streamGet(String path) async* {
    lastGetPath = path;
    if (streamGetLines != null) {
      for (final line in streamGetLines!) {
        yield line;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  @override
  Future<void> setAccessToken(String token) async {
    storedToken = token;
  }

  @override
  Future<String?> getAccessToken() async {
    return storedToken;
  }

  @override
  Future<void> clearAccessToken() async {
    storedToken = null;
  }

  @override
  Future<void> setRefreshToken(String token) async {
    storedRefreshToken = token;
  }

  @override
  Future<String?> getRefreshToken() async {
    return storedRefreshToken;
  }

  @override
  Future<void> clearRefreshToken() async {
    storedRefreshToken = null;
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    lastGetQuery = queryParameters;
    if (getError != null) throw getError!;
    return Response<List<int>>(
      data: <int>[],
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }
}
