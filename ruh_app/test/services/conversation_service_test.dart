import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/conversation.dart';
import 'package:ruh_app/services/conversation_service.dart';

import '../test_support/fake_backend_client.dart';

void main() {
  late FakeBackendClient client;
  late ConversationService service;

  setUp(() {
    client = FakeBackendClient();
    service = ConversationService(client: client);
  });

  group('listConversations', () {
    test('returns list of Conversations', () async {
      client.getResponseData = {
        'conversations': [
          {
            'id': 'c1',
            'sandbox_id': 'sb1',
            'name': 'Chat 1',
            'message_count': 5,
            'created_at': '2024-01-01T00:00:00Z',
            'updated_at': '2024-01-01T00:00:00Z',
          },
        ],
      };

      final conversations = await service.listConversations('sb1');

      expect(conversations, hasLength(1));
      expect(conversations.first.id, 'c1');
      expect(conversations.first.name, 'Chat 1');
      expect(conversations.first.messageCount, 5);
      expect(client.lastGetPath, '/api/sandboxes/sb1/conversations');
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final conversations = await service.listConversations('sb1');

      expect(conversations, isEmpty);
    });
  });

  group('createConversation', () {
    test('returns created Conversation', () async {
      client.postResponseData = {
        'id': 'c2',
        'sandbox_id': 'sb1',
        'name': 'New Chat',
        'message_count': 0,
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-01T00:00:00Z',
      };

      final conversation = await service.createConversation('sb1');

      expect(conversation.id, 'c2');
      expect(conversation.name, 'New Chat');
      expect(client.lastPostPath, '/api/sandboxes/sb1/conversations');
    });
  });

  group('getMessages', () {
    test('returns List<Message> from response', () async {
      client.getResponseData = {
        'messages': [
          {'role': 'user', 'content': 'hi'},
        ],
      };

      final messages = await service.getMessages('sb1', 'c1');

      expect(messages, hasLength(1));
      expect(messages.first.role, 'user');
      expect(messages.first.content, 'hi');
      expect(
        client.lastGetPath,
        '/api/sandboxes/sb1/conversations/c1/messages',
      );
    });

    test('passes before param as query parameter', () async {
      client.getResponseData = {'messages': <dynamic>[]};

      await service.getMessages('sb1', 'c1', before: 'msg99');

      expect(client.lastGetQuery?['before'], 'msg99');
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final messages = await service.getMessages('sb1', 'c1');

      expect(messages, isEmpty);
    });
  });

  group('renameConversation', () {
    test('sends patch with new name', () async {
      await service.renameConversation('sb1', 'c1', 'New name');

      expect(
        client.lastPatchPath,
        '/api/sandboxes/sb1/conversations/c1',
      );
      expect(client.lastPatchBody, {'name': 'New name'});
    });
  });

  group('deleteConversation', () {
    test('sends delete to correct path', () async {
      await service.deleteConversation('sb1', 'c1');

      expect(
        client.lastDeletePath,
        '/api/sandboxes/sb1/conversations/c1',
      );
    });
  });
}
