import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/conversation.dart';

void main() {
  group('Conversation.fromJson', () {
    test('parses full JSON', () {
      final json = {
        'id': 'conv-1',
        'sandbox_id': 'sb-1',
        'name': 'Budget Discussion',
        'message_count': 42,
        'created_at': '2025-06-01T10:00:00.000Z',
        'updated_at': '2025-06-01T11:00:00.000Z',
      };

      final conv = Conversation.fromJson(json);

      expect(conv.id, 'conv-1');
      expect(conv.sandboxId, 'sb-1');
      expect(conv.name, 'Budget Discussion');
      expect(conv.messageCount, 42);
      expect(conv.createdAt, DateTime.parse('2025-06-01T10:00:00.000Z'));
      expect(conv.updatedAt, DateTime.parse('2025-06-01T11:00:00.000Z'));
    });

    test('uses defaults for optional fields', () {
      final json = {
        'id': 'conv-2',
        'sandbox_id': 'sb-2',
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      };

      final conv = Conversation.fromJson(json);

      expect(conv.name, 'Untitled');
      expect(conv.messageCount, 0);
    });
  });

  group('Conversation.toJson', () {
    test('round-trip preserves all fields', () {
      final original = Conversation(
        id: 'conv-rt',
        sandboxId: 'sb-rt',
        name: 'Round Trip',
        messageCount: 10,
        createdAt: DateTime.parse('2025-02-01T00:00:00.000Z'),
        updatedAt: DateTime.parse('2025-02-02T00:00:00.000Z'),
      );

      final json = original.toJson();
      final restored = Conversation.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.sandboxId, original.sandboxId);
      expect(restored.name, original.name);
      expect(restored.messageCount, original.messageCount);
      expect(restored.createdAt, original.createdAt);
      expect(restored.updatedAt, original.updatedAt);
    });
  });

  group('Message.fromJson', () {
    test('parses message without workspace_state', () {
      final msg = Message.fromJson({
        'role': 'user',
        'content': 'Hello agent',
      });

      expect(msg.role, 'user');
      expect(msg.content, 'Hello agent');
      expect(msg.workspaceState, isNull);
    });

    test('parses message with workspace_state', () {
      final msg = Message.fromJson({
        'role': 'assistant',
        'content': 'Working on it',
        'workspace_state': {
          'browser': {'url': 'https://example.com', 'title': 'Example'},
          'task': {
            'steps': [
              {'id': 1, 'label': 'Thinking', 'status': 'done'}
            ],
          },
        },
      });

      expect(msg.role, 'assistant');
      expect(msg.workspaceState, isNotNull);
      expect(msg.workspaceState!.browser, isNotNull);
      expect(msg.workspaceState!.task, isNotNull);
    });
  });

  group('Message.toJson', () {
    test('omits workspace_state when null', () {
      final json = const Message(role: 'user', content: 'hi').toJson();

      expect(json['role'], 'user');
      expect(json['content'], 'hi');
      expect(json.containsKey('workspace_state'), isFalse);
    });

    test('includes workspace_state when present', () {
      final msg = Message(
        role: 'assistant',
        content: 'done',
        workspaceState: MessageWorkspaceState(
          browser: BrowserState(url: 'https://x.com'),
        ),
      );

      final json = msg.toJson();

      expect(json.containsKey('workspace_state'), isTrue);
      final ws = json['workspace_state'] as Map<String, dynamic>;
      expect(ws['browser']['url'], 'https://x.com');
    });
  });

  group('MessageWorkspaceState.fromJson', () {
    test('parses browser and task', () {
      final ws = MessageWorkspaceState.fromJson({
        'browser': {
          'url': 'https://ads.google.com',
          'title': 'Google Ads',
          'screenshot_url': 'https://img.example.com/shot.png',
        },
        'task': {
          'steps': [
            {'id': 1, 'label': 'Step 1', 'status': 'done'},
            {'id': 2, 'label': 'Step 2', 'status': 'active'},
          ],
        },
      });

      expect(ws.browser, isNotNull);
      expect(ws.browser!.url, 'https://ads.google.com');
      expect(ws.browser!.screenshotUrl, 'https://img.example.com/shot.png');
      expect(ws.task, isNotNull);
      expect(ws.task!.steps, hasLength(2));
    });

    test('handles missing browser and task gracefully', () {
      final ws = MessageWorkspaceState.fromJson({});

      expect(ws.browser, isNull);
      expect(ws.task, isNull);
    });
  });

  group('BrowserState.fromJson', () {
    test('all fields null', () {
      final bs = BrowserState.fromJson({});

      expect(bs.url, isNull);
      expect(bs.title, isNull);
      expect(bs.screenshotUrl, isNull);
    });

    test('all fields populated', () {
      final bs = BrowserState.fromJson({
        'url': 'https://example.com',
        'title': 'Example',
        'screenshot_url': 'https://img.example.com/s.png',
      });

      expect(bs.url, 'https://example.com');
      expect(bs.title, 'Example');
      expect(bs.screenshotUrl, 'https://img.example.com/s.png');
    });
  });

  group('TaskState.fromJson', () {
    test('parses steps list', () {
      final ts = TaskState.fromJson({
        'steps': [
          {'id': 1, 'kind': 'tool_call', 'label': 'Search', 'status': 'done'},
          {'id': 2, 'kind': 'thinking', 'label': 'Analyze', 'status': 'active'},
        ],
      });

      expect(ts.steps, hasLength(2));
      expect(ts.steps[0].kind, 'tool_call');
      expect(ts.steps[1].status, 'active');
    });

    test('defaults to empty steps when missing', () {
      final ts = TaskState.fromJson({});

      expect(ts.steps, isEmpty);
    });
  });

  group('TaskStep', () {
    test('fromJson with defaults', () {
      final step = TaskStep.fromJson({'id': 5});

      expect(step.id, 5);
      expect(step.kind, 'thinking');
      expect(step.label, '');
      expect(step.status, 'active');
      expect(step.detail, isNull);
      expect(step.toolName, isNull);
      expect(step.elapsedMs, isNull);
    });

    test('fromJson with all fields', () {
      final step = TaskStep.fromJson({
        'id': 3,
        'kind': 'tool_call',
        'label': 'Fetching data',
        'status': 'done',
        'detail': 'Got 100 rows',
        'tool_name': 'sql_query',
        'elapsed_ms': 1500,
      });

      expect(step.id, 3);
      expect(step.kind, 'tool_call');
      expect(step.label, 'Fetching data');
      expect(step.status, 'done');
      expect(step.detail, 'Got 100 rows');
      expect(step.toolName, 'sql_query');
      expect(step.elapsedMs, 1500);
    });

    test('isDone is true when status is done', () {
      final step = TaskStep.fromJson({'id': 1, 'status': 'done'});
      expect(step.isDone, isTrue);
    });

    test('isDone is false when status is not done', () {
      final step = TaskStep.fromJson({'id': 1, 'status': 'active'});
      expect(step.isDone, isFalse);
    });

    test('toJson omits null optional fields', () {
      final step = TaskStep(id: 1, kind: 'thinking', label: 'x', status: 'active');
      final json = step.toJson();

      expect(json['id'], 1);
      expect(json['kind'], 'thinking');
      expect(json.containsKey('detail'), isFalse);
      expect(json.containsKey('tool_name'), isFalse);
      expect(json.containsKey('elapsed_ms'), isFalse);
    });

    test('toJson includes non-null optional fields', () {
      final step = TaskStep(
        id: 2,
        kind: 'tool_call',
        label: 'Run',
        status: 'done',
        detail: 'OK',
        toolName: 'exec',
        elapsedMs: 200,
      );
      final json = step.toJson();

      expect(json['detail'], 'OK');
      expect(json['tool_name'], 'exec');
      expect(json['elapsed_ms'], 200);
    });
  });
}
