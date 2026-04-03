import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/sandbox.dart';
import 'package:ruh_app/services/sandbox_service.dart';

import '../test_support/fake_backend_client.dart';

void main() {
  late FakeBackendClient client;
  late SandboxService service;

  setUp(() {
    client = FakeBackendClient();
    service = SandboxService(client: client);
  });

  group('listSandboxes', () {
    test('returns list of SandboxRecord', () async {
      client.getResponseData = {
        'sandboxes': [
          {
            'sandbox_id': 'sb1',
            'sandbox_name': 'test',
            'sandbox_state': 'running',
            'gateway_port': 18789,
            'approved': true,
            'created_at': '2024-01-01T00:00:00Z',
          },
        ],
      };

      final sandboxes = await service.listSandboxes();

      expect(sandboxes, hasLength(1));
      expect(sandboxes.first.sandboxId, 'sb1');
      expect(sandboxes.first.sandboxName, 'test');
      expect(sandboxes.first.sandboxState, 'running');
      expect(client.lastGetPath, '/api/sandboxes');
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final sandboxes = await service.listSandboxes();

      expect(sandboxes, isEmpty);
    });
  });

  group('getSandbox', () {
    test('returns SandboxRecord on success', () async {
      client.getResponseData = {
        'sandbox_id': 'sb1',
        'sandbox_name': 'test',
        'sandbox_state': 'running',
        'gateway_port': 18789,
        'approved': true,
        'created_at': '2024-01-01T00:00:00Z',
      };

      final sandbox = await service.getSandbox('sb1');

      expect(sandbox, isNotNull);
      expect(sandbox!.sandboxId, 'sb1');
      expect(client.lastGetPath, '/api/sandboxes/sb1');
    });

    test('returns null on exception', () async {
      client.getError = Exception('not found');

      final sandbox = await service.getSandbox('sb1');

      expect(sandbox, isNull);
    });
  });

  group('deleteSandbox', () {
    test('sends delete to correct path', () async {
      await service.deleteSandbox('sb1');

      expect(client.lastDeletePath, '/api/sandboxes/sb1');
    });
  });

  group('getSandboxHealth', () {
    test('returns SandboxHealth', () async {
      client.getResponseData = {
        'is_running': true,
        'gateway_status': 'healthy',
        'gateway_port': 18789,
        'conversation_count': 2,
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

  group('getWorkspaceFiles', () {
    test('returns list of file paths', () async {
      client.getResponseData = {
        'files': ['src/main.dart', 'lib/app.dart'],
      };

      final files = await service.getWorkspaceFiles('sb1');

      expect(files, hasLength(2));
      expect(files.first, 'src/main.dart');
      expect(
        client.lastGetPath,
        '/api/sandboxes/sb1/workspace/files',
      );
    });

    test('returns empty list when data is null', () async {
      client.getResponseData = null;

      final files = await service.getWorkspaceFiles('sb1');

      expect(files, isEmpty);
    });
  });

  group('getWorkspaceFile', () {
    test('returns file content string', () async {
      client.getResponseData = {'content': 'hello world'};

      final content = await service.getWorkspaceFile('sb1', 'src/main.dart');

      expect(content, 'hello world');
      expect(client.lastGetPath, '/api/sandboxes/sb1/workspace/file');
      expect(client.lastGetQuery?['path'], 'src/main.dart');
    });

    test('returns empty string when data is null', () async {
      client.getResponseData = null;

      final content = await service.getWorkspaceFile('sb1', 'src/main.dart');

      expect(content, isEmpty);
    });
  });
}
