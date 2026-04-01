import 'dart:convert';

import 'api_client.dart';
import 'logger.dart';

/// The type of event received from the agent forge SSE stream.
enum ForgeEventType {
  /// Incremental progress log from the forge process.
  log,

  /// Final result indicating the agent was successfully created.
  result,

  /// An error occurred during creation.
  error,

  /// The agent configuration was approved and is being finalized.
  approved,
}

/// A single parsed event from the forge SSE stream.
class ForgeEvent {
  final ForgeEventType type;
  final String message;
  final Map<String, dynamic>? data;

  const ForgeEvent({required this.type, required this.message, this.data});

  @override
  String toString() => 'ForgeEvent(type: $type, message: $message)';
}

/// Service that handles the agent creation forge workflow.
///
/// 1. POST /api/agents/create  -> returns agent_id + stream_id
/// 2. GET  /api/agents/{agentId}/forge/stream/{streamId}  -> SSE progress
class ForgeService {
  ForgeService({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  static const String _tag = 'ForgeService';

  /// Create a new agent and return the agent ID and stream ID.
  Future<({String agentId, String streamId})> createAgent({
    required String name,
    String? description,
  }) async {
    Log.i(_tag, 'Creating agent: name=$name');

    final response = await _client.post<Map<String, dynamic>>(
      '/api/agents/create',
      data: {
        'name': name,
        if (description != null && description.isNotEmpty)
          'description': description,
      },
    );

    final json = response.data!;
    final agentId = json['agent_id'] as String;
    final streamId = json['stream_id'] as String;

    Log.i(_tag, 'Agent created: agentId=$agentId, streamId=$streamId');

    return (agentId: agentId, streamId: streamId);
  }

  /// Stream forge progress events for an agent creation.
  ///
  /// Connects to the SSE endpoint and yields [ForgeEvent]s as they arrive.
  Stream<ForgeEvent> streamForgeProgress(
    String agentId,
    String streamId,
  ) async* {
    Log.i(
      _tag,
      'Streaming forge progress: agentId=$agentId, streamId=$streamId',
    );

    String? currentEvent;

    await for (final line in _client.streamGet(
      '/api/agents/$agentId/forge/stream/$streamId',
    )) {
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
        Log.i(_tag, 'Forge stream complete [DONE]');
        return;
      }

      // Attempt JSON parse
      Map<String, dynamic>? json;
      try {
        json = jsonDecode(payload) as Map<String, dynamic>?;
      } catch (_) {
        // Non-JSON data — treat as plain text log
        yield ForgeEvent(
          type: _eventTypeFromString(currentEvent),
          message: payload,
        );
        continue;
      }

      final message =
          json?['message'] as String? ?? json?['error'] as String? ?? payload;

      final eventType = _eventTypeFromString(currentEvent);

      Log.d(_tag, 'Forge event: $eventType — $message');

      yield ForgeEvent(type: eventType, message: message, data: json);
    }
  }

  /// Map SSE event name string to [ForgeEventType].
  static ForgeEventType _eventTypeFromString(String? event) {
    switch (event) {
      case 'log':
        return ForgeEventType.log;
      case 'result':
        return ForgeEventType.result;
      case 'error':
        return ForgeEventType.error;
      case 'approved':
        return ForgeEventType.approved;
      default:
        return ForgeEventType.log;
    }
  }
}
