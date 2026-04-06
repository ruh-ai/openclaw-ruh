import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/customer_agent_config.dart';
import 'package:ruh_app/services/agent_service.dart';
import 'package:ruh_app/services/api_client.dart';

class FakeBackendClient implements BackendClient {
  dynamic getResponseData;
  dynamic patchResponseData;
  String? lastGetPath;
  String? lastPatchPath;
  Object? lastPatchBody;

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async {
    lastGetPath = path;
    return Response<T>(
      data: getResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> postLongRunning<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    lastPatchPath = path;
    lastPatchBody = data;
    return Response<T>(
      data: patchResponseData as T,
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Future<void> setAccessToken(String token) async {}

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<void> clearRefreshToken() async {}
}

void main() {
  group('AgentService customer config', () {
    test('loads the customer config snapshot from the backend route', () async {
      final client = FakeBackendClient()
        ..getResponseData = {
          'agent': {
            'id': 'agent-1',
            'name': 'Revenue Copilot',
            'avatar': '🤖',
            'description': 'Optimizes spend.',
            'status': 'active',
            'sandboxIds': const ['sandbox-1'],
            'createdAt': '2026-04-02T10:00:00.000Z',
            'updatedAt': '2026-04-02T11:00:00.000Z',
          },
          'skills': const ['campaign-analysis', 'reporting'],
          'agentRules': const ['Always explain tradeoffs plainly'],
          'runtimeInputs': const [
            {
              'key': 'GOOGLE_ADS_CUSTOMER_ID',
              'label': 'Customer ID',
              'description': 'Primary account identifier',
              'required': true,
              'source': 'architect_requirement',
              'value': '123-456-7890',
            },
          ],
          'toolConnections': const [
            {
              'toolId': 'google-ads',
              'name': 'Google Ads',
              'description': 'Campaign management',
              'status': 'configured',
              'connectorType': 'mcp',
            },
          ],
          'triggers': const [
            {
              'id': 'daily',
              'title': 'Daily Summary',
              'kind': 'schedule',
              'status': 'supported',
              'description': 'Sends a daily summary',
            },
          ],
          'channels': const [
            {
              'kind': 'slack',
              'status': 'configured',
              'label': 'Slack',
              'description': 'Posts to the ads room',
            },
          ],
          'workspaceMemory': {
            'instructions': 'Use the latest report first.',
            'continuitySummary': 'Waiting on budget approvals.',
            'pinnedPaths': const ['reports/april.md'],
            'updatedAt': '2026-04-02T11:05:00.000Z',
          },
          'creationSession': {
            'summary': 'Created from Google Ads template',
          },
        };
      final service = AgentService(client: client);

      final config = await service.getCustomerConfig('agent-1');

      expect(client.lastGetPath, '/api/agents/agent-1/customer-config');
      expect(config.agent.name, 'Revenue Copilot');
      expect(config.agentRules, ['Always explain tradeoffs plainly']);
      expect(config.runtimeInputs.single.value, '123-456-7890');
      expect(config.workspaceMemory.instructions, 'Use the latest report first.');
      expect(config.creationSession?['summary'], 'Created from Google Ads template');
    });

    test('serializes runtime input value updates to the customer config patch route', () async {
      final client = FakeBackendClient()
        ..patchResponseData = {
          'agent': {
            'id': 'agent-1',
            'name': 'Revenue Copilot',
            'avatar': '🤖',
            'description': 'Optimizes spend.',
            'status': 'active',
            'sandboxIds': const ['sandbox-1'],
            'createdAt': '2026-04-02T10:00:00.000Z',
            'updatedAt': '2026-04-02T11:00:00.000Z',
          },
          'skills': const [],
          'agentRules': const ['Always explain ROI'],
          'runtimeInputs': const [
            {
              'key': 'GOOGLE_ADS_CUSTOMER_ID',
              'label': 'Customer ID',
              'description': 'Primary account identifier',
              'required': true,
              'source': 'architect_requirement',
              'value': '123-456-7890',
            },
          ],
          'toolConnections': const [],
          'triggers': const [],
          'channels': const [],
          'workspaceMemory': {
            'instructions': '',
            'continuitySummary': '',
            'pinnedPaths': const [],
            'updatedAt': null,
          },
          'creationSession': null,
        };
      final service = AgentService(client: client);

      final config = await service.updateCustomerConfig(
        'agent-1',
        name: 'Revenue Copilot',
        description: 'Optimizes spend.',
        agentRules: const ['Always explain ROI'],
        runtimeInputValues: const [
          RuntimeInputValueUpdate(
            key: 'GOOGLE_ADS_CUSTOMER_ID',
            value: '123-456-7890',
          ),
        ],
      );

      expect(client.lastPatchPath, '/api/agents/agent-1/customer-config');
      expect(
        client.lastPatchBody,
        {
          'name': 'Revenue Copilot',
          'description': 'Optimizes spend.',
          'agentRules': ['Always explain ROI'],
          'runtimeInputValues': [
            {
              'key': 'GOOGLE_ADS_CUSTOMER_ID',
              'value': '123-456-7890',
            },
          ],
        },
      );
      expect(config.runtimeInputs.single.value, '123-456-7890');
    });
  });
}
