import '../models/sandbox.dart';
import 'api_client.dart';

/// Service for managing sandboxes (agent containers) via the REST backend.
class SandboxService {
  SandboxService({ApiClient? client}) : _client = client ?? ApiClient();

  final ApiClient _client;

  /// Fetch all sandboxes for the authenticated user.
  Future<List<SandboxRecord>> listSandboxes() async {
    final response = await _client.get<Map<String, dynamic>>('/api/sandboxes');
    final data = response.data;
    if (data == null) return [];

    final list = data['sandboxes'] as List<dynamic>? ?? [];
    return list
        .map((e) => SandboxRecord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single sandbox by [id]. Returns `null` if not found.
  Future<SandboxRecord?> getSandbox(String id) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/sandboxes/$id',
      );
      final data = response.data;
      if (data == null) return null;
      return SandboxRecord.fromJson(data);
    } on Exception {
      return null;
    }
  }

  /// Delete a sandbox by [id].
  Future<void> deleteSandbox(String id) async {
    await _client.delete('/api/sandboxes/$id');
  }

  /// Get health/status information for a sandbox.
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

  /// List all files in the sandbox workspace.
  Future<List<String>> getWorkspaceFiles(String sandboxId) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/workspace/files',
    );
    final data = response.data;
    if (data == null) return [];

    final items =
        data['items'] as List<dynamic>? ??
        data['files'] as List<dynamic>? ??
        [];
    return items
        .map((entry) {
          if (entry is Map<String, dynamic>) {
            return entry['path'] as String? ?? entry['name'] as String? ?? '';
          }
          return entry.toString();
        })
        .where((path) => path.isNotEmpty)
        .toList();
  }

  /// Read a single file from the sandbox workspace by [path].
  Future<String> getWorkspaceFile(String sandboxId, String path) async {
    final response = await _client.get<Map<String, dynamic>>(
      '/api/sandboxes/$sandboxId/workspace/file',
      queryParameters: {'path': path},
    );
    final data = response.data;
    return data?['content'] as String? ?? '';
  }
}
