import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/chat_service.dart';

class FakeBackendClient implements BackendClient {
  final List<String> streamLines;
  String? lastStreamPostPath;
  Map<String, dynamic>? lastStreamPostBody;

  FakeBackendClient({this.streamLines = const []});

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
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
  Stream<String> streamPost(String path, Map<String, dynamic> data) async* {
    lastStreamPostPath = path;
    lastStreamPostBody = data;
    for (final line in streamLines) {
      yield line;
    }
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
  group('ChatService', () {
    test(
      'uses the websocket-backed chat route and resets event context',
      () async {
        final client = FakeBackendClient(
          streamLines: const [
            'event: status',
            'data: {"message":"Agent started...","phase":"authenticated"}',
            'data: {"choices":[{"delta":{"content":"Hello"}}]}',
            'data: [DONE]',
          ],
        );
        final service = ChatService(client: client);

        final events = await service
            .sendMessage(sandboxId: 'sandbox-1', message: 'Hi')
            .toList();

        expect(client.lastStreamPostPath, '/api/sandboxes/sandbox-1/chat/ws');
        expect(events[0].type, ChatEventType.status);
        expect(events[0].content, 'Agent started...');
        expect(events[1].type, ChatEventType.textDelta);
        expect(events[1].content, 'Hello');
        expect(events.last.type, ChatEventType.done);
      },
    );

    test('parses structured tool events from SSE payloads', () async {
      final client = FakeBackendClient(
        streamLines: const [
          'event: tool_start',
          'data: {"tool":"bash","input":"ls -la"}',
          'event: tool_end',
          'data: {"tool":"bash","output":"done"}',
          'data: [DONE]',
        ],
      );
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sandbox-2', message: 'Inspect files')
          .toList();

      expect(events[0].type, ChatEventType.toolStart);
      expect(events[0].toolName, 'bash');
      expect(events[0].toolInput, 'ls -la');
      expect(events[1].type, ChatEventType.toolEnd);
      expect(events[1].toolName, 'bash');
      expect(events[1].content, 'done');
      expect(events.last.type, ChatEventType.done);
    });
  });
}
