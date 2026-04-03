import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/agent.dart';

void main() {
  group('Agent.fromJson', () {
    test('parses full JSON with all fields populated', () {
      final json = {
        'id': 'agent-1',
        'name': 'Google Ads Agent',
        'avatar': '🎯',
        'description': 'Manages Google Ads campaigns',
        'skills': ['campaign-mgmt', 'reporting'],
        'trigger_label': 'ad-trigger',
        'status': 'active',
        'sandbox_ids': ['sb-1', 'sb-2'],
        'forge_sandbox_id': 'forge-1',
        'skill_graph': [
          {'id': 1, 'label': 'node'}
        ],
        'agent_rules': ['rule-1'],
        'runtime_inputs': [
          {
            'key': 'api_key',
            'label': 'API Key',
            'description': 'Google Ads API key',
            'required': true,
            'value': 'abc123',
          }
        ],
        'tool_connections': [
          {
            'tool_id': 'tc-1',
            'name': 'Google Ads',
            'description': 'Ads connector',
            'status': 'connected',
            'connector_type': 'oauth',
          }
        ],
        'triggers': [
          {
            'id': 'tr-1',
            'title': 'Daily Report',
            'kind': 'cron',
            'status': 'enabled',
            'description': 'Runs daily',
            'schedule': '0 9 * * *',
          }
        ],
        'channels': [
          {
            'kind': 'slack',
            'status': 'connected',
            'label': '#ads',
            'description': 'Slack channel',
          }
        ],
        'workspace_memory': {
          'instructions': 'Be helpful',
          'continuity_summary': 'Last session was about budgets',
          'pinned_paths': ['skills/reporting.md'],
        },
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-06-15T12:00:00.000Z',
      };

      final agent = Agent.fromJson(json);

      expect(agent.id, 'agent-1');
      expect(agent.name, 'Google Ads Agent');
      expect(agent.avatar, '🎯');
      expect(agent.description, 'Manages Google Ads campaigns');
      expect(agent.skills, ['campaign-mgmt', 'reporting']);
      expect(agent.triggerLabel, 'ad-trigger');
      expect(agent.status, 'active');
      expect(agent.sandboxIds, ['sb-1', 'sb-2']);
      expect(agent.forgeSandboxId, 'forge-1');
      expect(agent.skillGraph, isNotNull);
      expect(agent.agentRules, ['rule-1']);
      expect(agent.runtimeInputs, hasLength(1));
      expect(agent.toolConnections, hasLength(1));
      expect(agent.triggers, hasLength(1));
      expect(agent.channels, hasLength(1));
      expect(agent.workspaceMemory, isNotNull);
      expect(agent.createdAt, DateTime.parse('2025-01-01T00:00:00.000Z'));
      expect(agent.updatedAt, DateTime.parse('2025-06-15T12:00:00.000Z'));
    });

    test('uses defaults for minimal JSON (id + timestamps only)', () {
      final json = {
        'id': 'agent-min',
        'created_at': '2025-03-01T00:00:00.000Z',
        'updated_at': '2025-03-01T00:00:00.000Z',
      };

      final agent = Agent.fromJson(json);

      expect(agent.id, 'agent-min');
      expect(agent.name, '');
      expect(agent.avatar, '🤖');
      expect(agent.description, '');
      expect(agent.skills, isEmpty);
      expect(agent.triggerLabel, '');
      expect(agent.status, 'draft');
      expect(agent.sandboxIds, isEmpty);
      expect(agent.forgeSandboxId, isNull);
      expect(agent.skillGraph, isNull);
      expect(agent.agentRules, isEmpty);
      expect(agent.runtimeInputs, isEmpty);
      expect(agent.toolConnections, isEmpty);
      expect(agent.triggers, isEmpty);
      expect(agent.channels, isEmpty);
      expect(agent.workspaceMemory, isNull);
    });

    test('skills as mixed-type list maps to List<String>', () {
      final json = {
        'id': 'agent-mix',
        'skills': [1, 'skill-2'],
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      };

      final agent = Agent.fromJson(json);

      expect(agent.skills, ['1', 'skill-2']);
      expect(agent.skills, isA<List<String>>());
    });
  });

  group('Agent computed properties', () {
    Agent _agent({String status = 'draft', List<String> sandboxIds = const []}) {
      return Agent.fromJson({
        'id': 'a1',
        'status': status,
        'sandbox_ids': sandboxIds,
        'created_at': '2025-01-01T00:00:00.000Z',
        'updated_at': '2025-01-01T00:00:00.000Z',
      });
    }

    test('isActive is true when status is active', () {
      expect(_agent(status: 'active').isActive, isTrue);
    });

    test('isActive is false when status is draft', () {
      expect(_agent(status: 'draft').isActive, isFalse);
    });

    test('isDeployed is true when sandboxIds is non-empty', () {
      expect(_agent(sandboxIds: ['sb-1']).isDeployed, isTrue);
    });

    test('isDeployed is false when sandboxIds is empty', () {
      expect(_agent().isDeployed, isFalse);
    });

    test('deploymentCount matches sandboxIds length', () {
      expect(_agent(sandboxIds: ['a', 'b', 'c']).deploymentCount, 3);
      expect(_agent().deploymentCount, 0);
    });
  });

  group('AgentRuntimeInput.fromJson', () {
    test('parses all fields', () {
      final input = AgentRuntimeInput.fromJson({
        'key': 'api_key',
        'label': 'API Key',
        'description': 'Your API key',
        'required': true,
        'value': 'secret',
      });

      expect(input.key, 'api_key');
      expect(input.label, 'API Key');
      expect(input.description, 'Your API key');
      expect(input.required, isTrue);
      expect(input.value, 'secret');
    });

    test('uses defaults for missing fields', () {
      final input = AgentRuntimeInput.fromJson({'key': 'k'});

      expect(input.key, 'k');
      expect(input.label, '');
      expect(input.description, '');
      expect(input.required, isFalse);
      expect(input.value, '');
    });
  });

  group('AgentToolConnection.fromJson', () {
    test('parses all fields', () {
      final conn = AgentToolConnection.fromJson({
        'tool_id': 'tc-1',
        'name': 'Connector',
        'description': 'Desc',
        'status': 'connected',
        'connector_type': 'oauth',
      });

      expect(conn.toolId, 'tc-1');
      expect(conn.name, 'Connector');
      expect(conn.description, 'Desc');
      expect(conn.status, 'connected');
      expect(conn.connectorType, 'oauth');
    });

    test('uses defaults for missing fields', () {
      final conn = AgentToolConnection.fromJson({});

      expect(conn.toolId, '');
      expect(conn.status, 'available');
      expect(conn.connectorType, 'api');
    });
  });

  group('AgentTrigger.fromJson', () {
    test('parses all fields including schedule', () {
      final trigger = AgentTrigger.fromJson({
        'id': 'tr-1',
        'title': 'Nightly',
        'kind': 'cron',
        'status': 'enabled',
        'description': 'Runs at night',
        'schedule': '0 0 * * *',
      });

      expect(trigger.id, 'tr-1');
      expect(trigger.title, 'Nightly');
      expect(trigger.kind, 'cron');
      expect(trigger.status, 'enabled');
      expect(trigger.description, 'Runs at night');
      expect(trigger.schedule, '0 0 * * *');
    });

    test('defaults and null schedule', () {
      final trigger = AgentTrigger.fromJson({'id': 'tr-2'});

      expect(trigger.kind, 'manual');
      expect(trigger.schedule, isNull);
    });
  });

  group('AgentChannel.fromJson', () {
    test('parses all fields', () {
      final channel = AgentChannel.fromJson({
        'kind': 'telegram',
        'status': 'active',
        'label': '@bot',
        'description': 'Telegram bot',
      });

      expect(channel.kind, 'telegram');
      expect(channel.status, 'active');
      expect(channel.label, '@bot');
      expect(channel.description, 'Telegram bot');
    });

    test('defaults for missing fields', () {
      final channel = AgentChannel.fromJson({});

      expect(channel.kind, '');
      expect(channel.status, '');
      expect(channel.label, '');
    });
  });

  group('WorkspaceMemory', () {
    test('fromJson parses all fields', () {
      final mem = WorkspaceMemory.fromJson({
        'instructions': 'Be brief',
        'continuity_summary': 'Worked on budgets',
        'pinned_paths': ['a.md', 'b.md'],
      });

      expect(mem.instructions, 'Be brief');
      expect(mem.continuitySummary, 'Worked on budgets');
      expect(mem.pinnedPaths, ['a.md', 'b.md']);
    });

    test('defaults for missing/null fields', () {
      final mem = WorkspaceMemory.fromJson({});

      expect(mem.instructions, '');
      expect(mem.continuitySummary, '');
      expect(mem.pinnedPaths, isEmpty);
    });

    test('toJson round-trip', () {
      final original = WorkspaceMemory(
        instructions: 'inst',
        continuitySummary: 'summary',
        pinnedPaths: ['p1'],
      );

      final json = original.toJson();
      final restored = WorkspaceMemory.fromJson(json);

      expect(restored.instructions, original.instructions);
      expect(restored.continuitySummary, original.continuitySummary);
      expect(restored.pinnedPaths, original.pinnedPaths);
    });
  });
}
