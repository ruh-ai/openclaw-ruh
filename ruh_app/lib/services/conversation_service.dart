import '../models/conversation.dart';
import 'api_client.dart';

/// Service for managing conversations and messages within a sandbox.
class ConversationService {
  ConversationService({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  /// List conversations for the given [sandboxId].
  Future<List<Conversation>> listConversations(
    String sandboxId, {
    int limit = 20,
  }) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/conversations',
      queryParameters: {'limit': limit},
    );
    final data = response.data;
    if (data == null) return [];

    final list = data['conversations'] as List<dynamic>? ?? [];
    return list
        .map((e) => Conversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Create a new conversation in the given [sandboxId].
  Future<Conversation> createConversation(String sandboxId) async {
    final response = await _client.post<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/conversations',
    );
    return Conversation.fromJson(response.data!);
  }

  /// Fetch messages for a conversation.
  ///
  /// Use [limit] to control page size and [before] (message ID) for cursor
  /// pagination.
  Future<List<Message>> getMessages(
    String sandboxId,
    String conversationId, {
    int limit = 50,
    String? before,
  }) async {
    final queryParams = <String, dynamic>{'limit': limit};
    if (before != null) queryParams['before'] = before;

    final response = await _client.get<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/conversations/$conversationId/messages',
      queryParameters: queryParams,
    );
    final data = response.data;
    if (data == null) return [];

    final list = data['messages'] as List<dynamic>? ?? [];
    return list
        .map((e) => Message.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Rename a conversation.
  Future<void> renameConversation(
    String sandboxId,
    String conversationId,
    String name,
  ) async {
    await _client.patch(
      '/api/sandboxes/$sandboxId/conversations/$conversationId',
      data: {'name': name},
    );
  }

  /// Delete a conversation.
  Future<void> deleteConversation(
    String sandboxId,
    String conversationId,
  ) async {
    await _client.delete(
      '/api/sandboxes/$sandboxId/conversations/$conversationId',
    );
  }
}
