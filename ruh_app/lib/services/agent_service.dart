import '../models/agent.dart';
import '../models/customer_agent_config.dart';
import '../models/sandbox.dart';
import 'api_client.dart';

/// Service for agent CRUD and sandbox health operations.
class AgentService {
  AgentService({BackendClient? client}) : _client = client ?? ApiClient();

  final BackendClient _client;

  /// Fetch all agents.
  Future<List<Agent>> listAgents() async {
    final response = await _client.get<List<dynamic>>('/api/agents');
    final data = response.data;
    if (data == null) return [];

    return data.map((e) => Agent.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Fetch a single agent by [id]. Returns `null` if not found.
  Future<Agent?> getAgent(String id) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/agents/$id',
      );
      final data = response.data;
      if (data == null) return null;
      return Agent.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  /// Fetch the customer-safe runtime config snapshot for an agent.
  Future<CustomerAgentConfig> getCustomerConfig(String id) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/agents/$id/customer-config',
    );
    return CustomerAgentConfig.fromJson(response.data!);
  }

  /// Provision and return a customer runtime agent's launchable record.
  Future<Agent> launchAgent(String id) async {
    final response = await _client.postLongRunning<Map<String, dynamic>>(
      '/api/agents/$id/launch',
    );
    final data = response.data ?? const <String, dynamic>{};
    final agentJson = data['agent'];
    if (agentJson is! Map<String, dynamic>) {
      throw StateError('Launch response did not include an agent');
    }
    return Agent.fromJson(agentJson);
  }

  /// Partially update an agent. Returns the updated record.
  Future<Agent> updateAgent(String id, Map<String, dynamic> patch) async {
    final response = await _client.patch<Map<String, dynamic>>(
      '/api/agents/$id',
      data: patch,
    );
    return Agent.fromJson(response.data!);
  }

  /// Update the customer-safe runtime config surface for an agent.
  Future<CustomerAgentConfig> updateCustomerConfig(
    String id, {
    String? name,
    String? description,
    List<String>? agentRules,
    List<RuntimeInputValueUpdate>? runtimeInputValues,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) {
      body['name'] = name;
    }
    if (description != null) {
      body['description'] = description;
    }
    if (agentRules != null) {
      body['agentRules'] = agentRules;
    }
    if (runtimeInputValues != null) {
      body['runtimeInputValues'] =
          runtimeInputValues.map((item) => item.toJson()).toList();
    }

    final response = await _client.patch<Map<String, dynamic>>(
      '/api/agents/$id/customer-config',
      data: body,
    );
    return CustomerAgentConfig.fromJson(response.data!);
  }

  /// Delete an agent by [id].
  Future<void> deleteAgent(String id) async {
    await _client.delete('/api/agents/$id');
  }

  /// Get workspace memory for an agent.
  Future<WorkspaceMemory> getWorkspaceMemory(String agentId) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/agents/$agentId/workspace-memory',
    );
    return WorkspaceMemory.fromJson(response.data!);
  }

  /// Update the workspace memory for an agent.
  Future<WorkspaceMemory> updateWorkspaceMemory(
    String agentId,
    WorkspaceMemory memory,
  ) async {
    final response = await _client.patch<Map<String, dynamic>>(
      '/api/agents/$agentId/workspace-memory',
      data: memory.toJson(),
    );
    return WorkspaceMemory.fromJson(response.data!);
  }

  /// Get health status for a sandbox.
  Future<SandboxHealth> getSandboxHealth(String sandboxId) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/status',
    );
    return SandboxHealth.fromJson(response.data!);
  }

  /// Restart a sandbox container.
  Future<void> restartSandbox(String sandboxId) async {
    await _client.post('/api/sandboxes/$sandboxId/restart');
  }
}
