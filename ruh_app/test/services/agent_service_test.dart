import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/agent.dart';
import 'package:ruh_app/services/agent_service.dart';

import '../test_support/fake_backend_client.dart';

void main() {
  late FakeBackendClient client;
  late AgentService service;

  setUp(() {
    client = FakeBackendClient();
    service = AgentService(client: client);
  });

  group('listAgents', () {
    test('returns List<Agent> from response data', () async {
      client.getResponseData = [
        {
          'id': 'a1',
          'name': 'Bot',
          'created_at': '2024-01-01T00:00:00Z',
          'updated_at': '2024-01-01T00:00:00Z',
        },
      ];

      final agents = await service.listAgents();

      expect(agents, hasLength(1));
      expect(agents.first.id, 'a1');
      expect(agents.first.name, 'Bot');
      expect(client.lastGetPath, '/api/agents');
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final agents = await service.listAgents();

      expect(agents, isEmpty);
    });
  });

  group('getAgent', () {
    test('returns Agent on success', () async {
      client.getResponseData = {
        'id': 'a1',
        'name': 'Bot',
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-01T00:00:00Z',
      };

      final agent = await service.getAgent('a1');

      expect(agent, isNotNull);
      expect(agent!.id, 'a1');
      expect(client.lastGetPath, '/api/agents/a1');
    });

    test('returns null on exception', () async {
      client.getError = Exception('not found');

      final agent = await service.getAgent('a1');

      expect(agent, isNull);
    });
  });

  group('launchAgent', () {
    test('returns Agent from nested agent key', () async {
      client.postResponseData = {
        'agent': {
          'id': 'a1',
          'name': 'Bot',
          'created_at': '2024-01-01T00:00:00Z',
          'updated_at': '2024-01-01T00:00:00Z',
        },
      };

      final agent = await service.launchAgent('a1');

      expect(agent.id, 'a1');
      expect(agent.name, 'Bot');
      expect(client.lastPostPath, '/api/agents/a1/launch');
    });

    test('throws StateError when response missing agent key', () async {
      client.postResponseData = <String, dynamic>{};

      expect(
        () => service.launchAgent('a1'),
        throwsA(isA<StateError>()),
      );
    });
  });

  group('updateAgent', () {
    test('sends patch and returns updated Agent', () async {
      client.patchResponseData = {
        'id': 'a1',
        'name': 'Updated Bot',
        'created_at': '2024-01-01T00:00:00Z',
        'updated_at': '2024-01-02T00:00:00Z',
      };

      final patch = {'name': 'Updated Bot'};
      final agent = await service.updateAgent('a1', patch);

      expect(agent.name, 'Updated Bot');
      expect(client.lastPatchPath, '/api/agents/a1');
      expect(client.lastPatchBody, patch);
    });
  });

  group('deleteAgent', () {
    test('sends delete to correct path', () async {
      await service.deleteAgent('a1');

      expect(client.lastDeletePath, '/api/agents/a1');
    });
  });

  group('getWorkspaceMemory', () {
    test('returns WorkspaceMemory on success', () async {
      client.getResponseData = {
        'instructions': 'Do X',
        'continuity_summary': '',
        'pinned_paths': <dynamic>[],
      };

      final memory = await service.getWorkspaceMemory('a1');

      expect(memory.instructions, 'Do X');
      expect(memory.continuitySummary, '');
      expect(memory.pinnedPaths, isEmpty);
      expect(client.lastGetPath, '/api/agents/a1/workspace-memory');
    });
  });

  group('updateWorkspaceMemory', () {
    test('sends patch with toJson output', () async {
      const memory = WorkspaceMemory(
        instructions: 'Be helpful',
        continuitySummary: 'summary',
        pinnedPaths: ['file.txt'],
      );

      await service.updateWorkspaceMemory('a1', memory);

      expect(client.lastPatchPath, '/api/agents/a1/workspace-memory');
      expect(client.lastPatchBody, memory.toJson());
    });
  });

  group('getSandboxHealth', () {
    test('returns SandboxHealth for correct path', () async {
      client.getResponseData = {
        'is_running': true,
        'gateway_status': 'healthy',
        'gateway_port': 18789,
        'conversation_count': 3,
      };

      final health = await service.getSandboxHealth('sb1');

      expect(health.isRunning, isTrue);
      expect(health.gatewayStatus, 'healthy');
      expect(client.lastGetPath, '/api/sandboxes/sb1/status');
    });
  });

  group('restartSandbox', () {
    test('posts to correct path', () async {
      await service.restartSandbox('sb1');

      expect(client.lastPostPath, '/api/sandboxes/sb1/restart');
    });
  });
}
