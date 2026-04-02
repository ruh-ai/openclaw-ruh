import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ruh_app/models/sandbox.dart';
import 'package:ruh_app/providers/agent_provider.dart';
import 'package:ruh_app/providers/sandbox_health_provider.dart';
import 'package:ruh_app/services/agent_service.dart';
import 'package:ruh_app/services/api_client.dart';

class _NoopBackendClient implements BackendClient {
  @override
  Future<void> clearAccessToken() async {}

  @override
  Future<void> clearRefreshToken() async {}

  @override
  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<String?> getAccessToken() async => null;

  @override
  Future<String?> getRefreshToken() async => null;

  @override
  Future<Response<List<int>>> getBytes(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
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
  Future<void> setAccessToken(String token) async {}

  @override
  Future<void> setRefreshToken(String token) async {}

  @override
  Stream<String> streamGet(String path) {
    throw UnimplementedError();
  }

  @override
  Stream<String> streamPost(String path, Map<String, dynamic> data) {
    throw UnimplementedError();
  }
}

class FakeAgentService extends AgentService {
  FakeAgentService({required List<SandboxHealth> healthSequence})
    : _healthSequence = Queue.of(healthSequence),
      _fallback = healthSequence.isNotEmpty
          ? healthSequence.last
          : const SandboxHealth(isRunning: false),
      super(client: _NoopBackendClient());

  final Queue<SandboxHealth> _healthSequence;
  final SandboxHealth _fallback;
  int healthCalls = 0;
  String? restartedSandboxId;

  @override
  Future<SandboxHealth> getSandboxHealth(String sandboxId) async {
    healthCalls += 1;
    if (_healthSequence.isNotEmpty) {
      return _healthSequence.removeFirst();
    }
    return _fallback;
  }

  @override
  Future<void> restartSandbox(String sandboxId) async {
    restartedSandboxId = sandboxId;
  }
}

void main() {
  test('refreshStatus updates the current sandbox health', () async {
    final service = FakeAgentService(
      healthSequence: const [
        SandboxHealth(
          isRunning: true,
          gatewayReachable: false,
          gatewayStatus: 'unhealthy',
        ),
        SandboxHealth(
          isRunning: true,
          gatewayReachable: true,
          gatewayStatus: 'healthy',
        ),
      ],
    );
    final container = ProviderContainer(
      overrides: [agentServiceProvider.overrideWithValue(service)],
    );
    addTearDown(container.dispose);

    final initial = await container.read(sandboxHealthProvider('sandbox-1').future);
    expect(initial?.isHealthy, isFalse);

    await container
        .read(sandboxHealthProvider('sandbox-1').notifier)
        .refreshStatus();

    final refreshed = container.read(sandboxHealthProvider('sandbox-1')).valueOrNull;
    expect(refreshed?.isHealthy, isTrue);
    expect(service.healthCalls, 2);
  });

  test('restartRuntime delegates to agent service and refreshes health', () async {
    final service = FakeAgentService(
      healthSequence: const [
        SandboxHealth(
          isRunning: false,
          gatewayReachable: false,
          gatewayStatus: 'unreachable',
        ),
        SandboxHealth(
          isRunning: true,
          gatewayReachable: true,
          gatewayStatus: 'healthy',
        ),
      ],
    );
    final container = ProviderContainer(
      overrides: [agentServiceProvider.overrideWithValue(service)],
    );
    addTearDown(container.dispose);

    await container.read(sandboxHealthProvider('sandbox-2').future);
    await container
        .read(sandboxHealthProvider('sandbox-2').notifier)
        .restartRuntime();

    final refreshed = container.read(sandboxHealthProvider('sandbox-2')).valueOrNull;
    expect(service.restartedSandboxId, 'sandbox-2');
    expect(refreshed?.isHealthy, isTrue);
  });
}
