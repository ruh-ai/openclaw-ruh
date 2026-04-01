import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/conversation.dart';
import '../services/logger.dart';

/// Offline conversation cache backed by shared_preferences.
///
/// Stores serialized conversation lists and message lists keyed by sandbox/
/// conversation ID so users can read chat history when the backend is
/// unreachable. Data is refreshed transparently whenever an API call succeeds.
class ConversationCache {
  static const _prefix = 'ruh_cache_';
  static const _tag = 'Cache';

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------

  /// Persist [conversations] for [sandboxId].
  Future<void> cacheConversations(
    String sandboxId,
    List<Conversation> conversations,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final json = conversations.map((c) => c.toJson()).toList();
    await prefs.setString('${_prefix}convs_$sandboxId', jsonEncode(json));
    Log.d(_tag, 'Cached ${conversations.length} conversations for $sandboxId');
  }

  /// Retrieve cached conversations for [sandboxId], or an empty list.
  Future<List<Conversation>> getCachedConversations(String sandboxId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('${_prefix}convs_$sandboxId');
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => Conversation.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      Log.w(_tag, 'Failed to read conversation cache for $sandboxId', e);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  /// Persist [messages] for [conversationId].
  Future<void> cacheMessages(
    String conversationId,
    List<Message> messages,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final json = messages.map((m) => m.toJson()).toList();
    await prefs.setString('${_prefix}msgs_$conversationId', jsonEncode(json));
    Log.d(_tag, 'Cached ${messages.length} messages for $conversationId');
  }

  /// Retrieve cached messages for [conversationId], or an empty list.
  Future<List<Message>> getCachedMessages(String conversationId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('${_prefix}msgs_$conversationId');
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      Log.w(_tag, 'Failed to read message cache for $conversationId', e);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /// Whether we have any cached conversation data for [sandboxId].
  Future<bool> hasCachedData(String sandboxId) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey('${_prefix}convs_$sandboxId');
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /// Remove all cache entries.
  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith(_prefix)).toList();
    for (final key in keys) {
      await prefs.remove(key);
    }
    Log.i(_tag, 'Cleared all conversation cache (${keys.length} keys)');
  }

  /// Remove cache entries scoped to [sandboxId].
  Future<void> clearForSandbox(String sandboxId) async {
    final prefs = await SharedPreferences.getInstance();
    final suffix = sandboxId;

    // Remove the conversation list key.
    await prefs.remove('${_prefix}convs_$suffix');

    // Remove any message keys whose conversation belongs to this sandbox.
    // We don't track the mapping directly, so clear conversation-list cache
    // and rely on next sync to repopulate messages.
    Log.i(_tag, 'Cleared cache for sandbox $sandboxId');
  }
}
