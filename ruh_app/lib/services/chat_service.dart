import 'dart:convert';

import 'api_client.dart';
import 'logger.dart';

/// The type of event received from the SSE chat stream.
enum ChatEventType {
  textDelta,
  toolStart,
  toolEnd,
  done,
  error,
  status,
}

/// A single parsed event from the chat SSE stream.
class ChatEvent {
  final ChatEventType type;
  final String? content;
  final String? toolName;
  final String? toolInput;

  const ChatEvent({
    required this.type,
    this.content,
    this.toolName,
    this.toolInput,
  });

  @override
  String toString() =>
      'ChatEvent(type: $type, content: $content, toolName: $toolName)';
}

/// Service that handles streaming chat with an OpenClaw agent sandbox.
class ChatService {
  ChatService({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  /// Send a user [message] to the sandbox identified by [sandboxId] and yield
  /// parsed [ChatEvent]s as they arrive over SSE.
  ///
  /// Optionally supply a [conversationId] to continue an existing conversation
  /// and a [model] override.
  Stream<ChatEvent> sendMessage({
    required String sandboxId,
    required String message,
    String? conversationId,
    String? model,
  }) async* {
    final body = <String, dynamic>{
      'messages': [
        {'role': 'user', 'content': message},
      ],
      'stream': true,
      if (conversationId != null) 'conversation_id': conversationId,
      if (model != null) 'model': model,
    };

    Log.i('Chat', 'Sending message to sandbox $sandboxId (conv: $conversationId, model: $model)');

    String? currentEvent;

    await for (final line
        in _client.streamPost('/api/sandboxes/$sandboxId/chat/ws', body)) {
      // SSE event type line: "event: <type>"
      if (line.startsWith('event:')) {
        currentEvent = line.substring('event:'.length).trim();
        continue;
      }

      // SSE data line: "data: <payload>"
      if (!line.startsWith('data:')) continue;

      final payload = line.substring('data:'.length).trim();

      // End-of-stream sentinel
      if (payload == '[DONE]') {
        Log.i('Chat', 'Stream complete [DONE]');
        yield const ChatEvent(type: ChatEventType.done);
        return;
      }

      // Attempt JSON parse
      Map<String, dynamic>? json;
      try {
        json = jsonDecode(payload) as Map<String, dynamic>?;
      } catch (_) {
        // Non-JSON data line — ignore
        continue;
      }
      if (json == null) continue;

      // Route based on event type
      switch (currentEvent) {
        case 'tool_start':
          yield ChatEvent(
            type: ChatEventType.toolStart,
            toolName: json['name'] as String? ?? json['tool'] as String?,
            toolInput: json['input']?.toString(),
          );
          break;

        case 'tool_end':
          yield ChatEvent(
            type: ChatEventType.toolEnd,
            toolName: json['name'] as String? ?? json['tool'] as String?,
            content: json['output']?.toString(),
          );
          break;

        case 'status':
          yield ChatEvent(
            type: ChatEventType.status,
            content: json['message'] as String? ?? payload,
          );
          break;

        case 'error':
          yield ChatEvent(
            type: ChatEventType.error,
            content: json['message'] as String? ??
                json['error'] as String? ??
                payload,
          );
          break;

        default:
          // Default: treat as text delta (OpenAI-compatible streaming format)
          final choices = json['choices'] as List<dynamic>?;
          if (choices != null && choices.isNotEmpty) {
            final delta =
                (choices[0] as Map<String, dynamic>)['delta'] as Map<String, dynamic>?;
            final content = delta?['content'] as String?;
            if (content != null && content.isNotEmpty) {
              yield ChatEvent(
                type: ChatEventType.textDelta,
                content: content,
              );
            }
          }
      }
    }
  }
}
