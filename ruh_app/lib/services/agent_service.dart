import '../models/agent.dart';
import '../models/sandbox.dart';
import 'api_client.dart';

/// Service for agent CRUD and sandbox health operations.
class AgentService {
  AgentService({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  /// Fetch all agents.
  Future<List<Agent>> listAgents() async {
    final response = await _client.get<Map<String, dynamic>>('/api/agents');
    final data = response.data;
    if (data == null) return [];

    final list = data['agents'] as List<dynamic>? ?? [];
    return list
        .map((e) => Agent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single agent by [id]. Returns `null` if not found.
  Future<Agent?> getAgent(String id) async {
    try {
      final response =
          await _client.get<Map<String, dynamic>>('/api/agents/$id');
      final data = response.data;
      if (data == null) return null;
      return Agent.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  /// Partially update an agent. Returns the updated record.
  Future<Agent> updateAgent(
    String id,
    Map<String, dynamic> patch,
  ) async {
    final response = await _client.patch<Map<String, dynamic>>(
      '/api/agents/$id',
      data: patch,
    );
    return Agent.fromJson(response.data!);
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
  Future<void> updateWorkspaceMemory(
    String agentId,
    WorkspaceMemory memory,
  ) async {
    await _client.patch(
      '/api/agents/$agentId/workspace-memory',
      data: memory.toJson(),
    );
  }

  /// Get health status for a sandbox.
  Future<SandboxHealth> getSandboxHealth(String sandboxId) async {
    final response = await _client
        .get<Map<String, dynamic>>('/api/sandboxes/$sandboxId/status');
    return SandboxHealth.fromJson(response.data!);
  }

  /// Restart a sandbox container.
  Future<void> restartSandbox(String sandboxId) async {
    await _client.post('/api/sandboxes/$sandboxId/restart');
  }
}
