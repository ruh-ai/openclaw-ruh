import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/conversation.dart';
import '../services/api_client.dart';
import '../services/conversation_service.dart';

/// Provider for conversation service singleton.
final _conversationServiceProvider = Provider<ConversationService>((ref) {
  return ConversationService(client: ApiClient());
});

/// Async provider that fetches conversations for a given sandbox ID.
/// Re-fetches automatically when the sandbox ID changes.
final conversationListProvider = FutureProvider.family
    .autoDispose<List<Conversation>, String>((ref, sandboxId) async {
      final service = ref.read(_conversationServiceProvider);
      return service.listConversations(sandboxId, limit: 50);
    });
