import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/services/api_client.dart';
import 'package:ruh_app/services/chat_service.dart';

/// Fake [BackendClient] that yields a fixed sequence of SSE lines.
class FakeStreamingClient implements BackendClient {
  final List<String> sseLines;

  FakeStreamingClient({required this.sseLines});

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) async* {
    for (final line in sseLines) {
      yield line;
    }
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> get<T>(
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
  Future<void> setAccessToken(String token) async {}

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> clearAccessToken() async {}
}

void main() {
  group('ChatService SSE parsing', () {
    test('emits textDelta events from OpenAI-compatible streaming format', () async {
      final client = FakeStreamingClient(sseLines: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" World"}}]}',
        'data: [DONE]',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'hi')
          .toList();

      expect(events, hasLength(3));
      expect(events[0].type, ChatEventType.textDelta);
      expect(events[0].content, 'Hello');
      expect(events[1].type, ChatEventType.textDelta);
      expect(events[1].content, ' World');
      expect(events[2].type, ChatEventType.done);
    });

    test('emits toolStart and toolEnd events', () async {
      final client = FakeStreamingClient(sseLines: [
        'event: tool_start',
        'data: {"name":"bash","input":"ls -la"}',
        'event: tool_end',
        'data: {"name":"bash","output":"file1 file2"}',
        'data: [DONE]',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'list files')
          .toList();

      expect(events, hasLength(3));
      expect(events[0].type, ChatEventType.toolStart);
      expect(events[0].toolName, 'bash');
      expect(events[0].toolInput, 'ls -la');
      expect(events[1].type, ChatEventType.toolEnd);
      expect(events[1].toolName, 'bash');
      expect(events[1].content, 'file1 file2');
      expect(events[2].type, ChatEventType.done);
    });

    test('emits status event for thinking messages', () async {
      final client = FakeStreamingClient(sseLines: [
        'event: status',
        'data: {"message":"Thinking..."}',
        'data: [DONE]',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'think')
          .toList();

      expect(events, hasLength(2));
      expect(events[0].type, ChatEventType.status);
      expect(events[0].content, 'Thinking...');
    });

    test('emits error event from error SSE type', () async {
      final client = FakeStreamingClient(sseLines: [
        'event: error',
        'data: {"message":"Agent unavailable"}',
        'data: [DONE]',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'hi')
          .toList();

      expect(events[0].type, ChatEventType.error);
      expect(events[0].content, 'Agent unavailable');
    });

    test('ignores non-JSON and non-data lines', () async {
      final client = FakeStreamingClient(sseLines: [
        ': keep-alive',
        'garbage line',
        'data: not-json',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}',
        'data: [DONE]',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'hi')
          .toList();

      expect(events.where((e) => e.type == ChatEventType.textDelta), hasLength(1));
      expect(events.last.type, ChatEventType.done);
    });

    test('terminates stream at [DONE] sentinel', () async {
      final client = FakeStreamingClient(sseLines: [
        'data: [DONE]',
        'data: {"choices":[{"delta":{"content":"should not appear"}}]}',
      ]);
      final service = ChatService(client: client);

      final events = await service
          .sendMessage(sandboxId: 'sb-1', message: 'hi')
          .toList();

      expect(events, hasLength(1));
      expect(events.single.type, ChatEventType.done);
    });
  });
}
