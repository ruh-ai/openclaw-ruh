import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/sandbox.dart';

void main() {
  group('SandboxRecord.fromJson', () {
    test('parses full JSON with snake_case keys', () {
      final json = {
        'sandbox_id': 'sb-1',
        'sandbox_name': 'my-sandbox',
        'sandbox_state': 'running',
        'standard_url': 'http://localhost:18789',
        'gateway_token': 'tok-abc',
        'gateway_port': 18789,
        'approved': true,
        'vnc_port': 5900,
        'dashboard_url': 'http://localhost:3000',
        'preview_ports': {'3000': 32100, '8080': 32101},
        'created_at': '2025-05-01T00:00:00.000Z',
      };

      final record = SandboxRecord.fromJson(json);

      expect(record.sandboxId, 'sb-1');
      expect(record.sandboxName, 'my-sandbox');
      expect(record.sandboxState, 'running');
      expect(record.standardUrl, 'http://localhost:18789');
      expect(record.gatewayToken, 'tok-abc');
      expect(record.gatewayPort, 18789);
      expect(record.approved, isTrue);
      expect(record.vncPort, 5900);
      expect(record.dashboardUrl, 'http://localhost:3000');
      expect(record.previewPorts, {3000: 32100, 8080: 32101});
      expect(record.createdAt, DateTime.parse('2025-05-01T00:00:00.000Z'));
    });

    test('preview_ports with string keys', () {
      final json = {
        'sandbox_id': 'sb-2',
        'sandbox_name': 'test',
        'sandbox_state': 'stopped',
        'gateway_port': 0,
        'approved': false,
        'preview_ports': {'3000': 32100},
        'created_at': '2025-01-01T00:00:00.000Z',
      };

      final record = SandboxRecord.fromJson(json);
      expect(record.previewPorts, {3000: 32100});
    });

    test('preview_ports with integer keys', () {
      final json = {
        'sandbox_id': 'sb-3',
        'sandbox_name': 'test',
        'sandbox_state': 'running',
        'gateway_port': 18789,
        'approved': true,
        'preview_ports': {3000: 32100, 8080: 32101},
        'created_at': '2025-01-01T00:00:00.000Z',
      };

      final record = SandboxRecord.fromJson(json);
      expect(record.previewPorts, {3000: 32100, 8080: 32101});
    });

    test('preview_ports null or missing defaults to empty map', () {
      final json = {
        'sandbox_id': 'sb-4',
        'sandbox_name': 'test',
        'sandbox_state': 'running',
        'gateway_port': 0,
        'approved': false,
        'created_at': '2025-01-01T00:00:00.000Z',
      };

      final record = SandboxRecord.fromJson(json);
      expect(record.previewPorts, isEmpty);

      final jsonNull = Map<String, dynamic>.from(json)
        ..['preview_ports'] = null;
      final recordNull = SandboxRecord.fromJson(jsonNull);
      expect(recordNull.previewPorts, isEmpty);
    });
  });

  group('SandboxRecord.toJson', () {
    test('round-trip preserves fields', () {
      final original = SandboxRecord(
        sandboxId: 'sb-rt',
        sandboxName: 'round-trip',
        sandboxState: 'running',
        standardUrl: 'http://localhost:18789',
        gatewayToken: 'tok',
        gatewayPort: 18789,
        approved: true,
        vncPort: 5900,
        dashboardUrl: 'http://dash.example.com',
        previewPorts: {3000: 32100},
        createdAt: DateTime.parse('2025-03-01T00:00:00.000Z'),
      );

      final json = original.toJson();
      final restored = SandboxRecord.fromJson(json);

      expect(restored.sandboxId, original.sandboxId);
      expect(restored.sandboxName, original.sandboxName);
      expect(restored.sandboxState, original.sandboxState);
      expect(restored.standardUrl, original.standardUrl);
      expect(restored.gatewayToken, original.gatewayToken);
      expect(restored.gatewayPort, original.gatewayPort);
      expect(restored.approved, original.approved);
      expect(restored.vncPort, original.vncPort);
      expect(restored.dashboardUrl, original.dashboardUrl);
      expect(restored.previewPorts, original.previewPorts);
      expect(restored.createdAt, original.createdAt);
    });
  });

  group('SandboxHealth.fromJson', () {
    test('parses full fields', () {
      final json = {
        'is_running': true,
        'gateway_status': 'healthy',
        'gateway_port': 18789,
        'deployed_at': '2025-04-01T12:00:00.000Z',
        'conversation_count': 5,
      };

      final health = SandboxHealth.fromJson(json);

      expect(health.isRunning, isTrue);
      expect(health.gatewayStatus, 'healthy');
      expect(health.gatewayPort, 18789);
      expect(health.deployedAt, DateTime.parse('2025-04-01T12:00:00.000Z'));
      expect(health.conversationCount, 5);
    });

    test('defaults when fields are missing', () {
      final health = SandboxHealth.fromJson({});

      expect(health.isRunning, isFalse);
      expect(health.gatewayStatus, isNull);
      expect(health.gatewayPort, isNull);
      expect(health.deployedAt, isNull);
      expect(health.conversationCount, 0);
    });

    test('isHealthy is true when gatewayStatus is healthy', () {
      final health = SandboxHealth.fromJson({
        'is_running': true,
        'gateway_status': 'healthy',
      });

      expect(health.isHealthy, isTrue);
    });

    test('isHealthy is false when gatewayStatus is not healthy', () {
      final health = SandboxHealth.fromJson({
        'is_running': true,
        'gateway_status': 'degraded',
      });

      expect(health.isHealthy, isFalse);
    });

    test('isHealthy is false when gatewayStatus is null', () {
      final health = SandboxHealth.fromJson({'is_running': false});

      expect(health.isHealthy, isFalse);
    });

    test('running alias matches isRunning', () {
      final running = SandboxHealth.fromJson({'is_running': true});
      final stopped = SandboxHealth.fromJson({'is_running': false});

      expect(running.running, isTrue);
      expect(stopped.running, isFalse);
    });
  });
}
