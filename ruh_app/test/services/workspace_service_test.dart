import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/workspace_service.dart';

class FakeBackendClient implements BackendClient {
  dynamic getResponseData;
  String? lastGetPath;
  Map<String, dynamic>? lastGetQueryParameters;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    lastGetQueryParameters = queryParameters;
    return Response<T>(
      data: getResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<void> setAccessToken(String token) async {}

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<void> clearRefreshToken() async {}
}

void main() {
  group('WorkspaceService', () {
    test('reads workspace files from the backend items array', () async {
      final client = FakeBackendClient()
        ..getResponseData = {
          'root': '',
          'items': const [
            {
              'path': 'skills/task-planner/SKILL.md',
              'size': 128,
              'modified_at': '2026-04-02T10:00:00.000Z',
            },
            {
              'path': 'SOUL.md',
              'size': 256,
              'modified_at': '2026-04-02T10:05:00.000Z',
            },
          ],
        };
      final service = WorkspaceService(client: client);

      final files = await service.listFiles('sandbox-1');

      expect(client.lastGetPath, '/api/sandboxes/sandbox-1/workspace/files');
      expect(files, hasLength(2));
      expect(files.first.path, 'skills/task-planner/SKILL.md');
      expect(files.first.name, 'SKILL.md');
      expect(files.first.depth, 2);
      expect(files.last.name, 'SOUL.md');
    });

    test('builds preview proxy urls from mapped preview ports', () async {
      final client = FakeBackendClient()
        ..getResponseData = {
          'ports': {'3000': 49956, '8080': 49965},
          'active': const [3000],
        };
      final service = WorkspaceService(client: client);

      final ports = await service.getPreviewPorts('sandbox-2');

      expect(client.lastGetPath, '/api/sandboxes/sandbox-2/preview/ports');
      expect(ports.map((port) => port.port).toList(), [3000, 8080]);
      expect(ports.first.label, 'Live preview');
      expect(
        ports.first.url,
        contains('/api/sandboxes/sandbox-2/preview/proxy/3000/'),
      );
    });
  });
}
