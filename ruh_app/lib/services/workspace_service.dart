import 'api_client.dart';
import 'logger.dart';

/// Metadata for a file in the sandbox workspace.
class WorkspaceFileEntry {
  final String path;
  final int? size;
  final String? modified;

  const WorkspaceFileEntry({required this.path, this.size, this.modified});

  factory WorkspaceFileEntry.fromJson(Map<String, dynamic> json) {
    return WorkspaceFileEntry(
      path: json['path'] as String? ?? '',
      size: (json['size'] as num?)?.toInt(),
      modified: json['modified'] as String?,
    );
  }

  /// The file name (last path segment).
  String get name {
    final segments = path.split('/');
    return segments.isNotEmpty ? segments.last : path;
  }

  /// Indentation depth based on path separators.
  int get depth {
    if (path.isEmpty) return 0;
    return '/'.allMatches(path).length;
  }
}

/// A detected preview port exposed by the sandbox.
class PreviewPort {
  final int port;
  final String? label;
  final String url;

  const PreviewPort({required this.port, this.label, required this.url});

  factory PreviewPort.fromJson(Map<String, dynamic> json) {
    return PreviewPort(
      port: (json['port'] as num?)?.toInt() ?? 0,
      label: json['label'] as String?,
      url: json['url'] as String? ?? '',
    );
  }
}

/// Service for interacting with sandbox workspace files and preview ports.
class WorkspaceService {
  WorkspaceService({BackendClient? client}) : _client = client ?? ApiClient();

  final BackendClient _client;
  static const String _tag = 'WorkspaceService';

  /// List files in the sandbox workspace.
  ///
  /// Returns a flat list of [WorkspaceFileEntry] objects with relative paths.
  /// Returns an empty list on error.
  Future<List<WorkspaceFileEntry>> listFiles(String sandboxId) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/sandboxes/$sandboxId/workspace/files',
      );
      final data = response.data;
      if (data == null) return [];

      final files = data['files'] as List<dynamic>? ?? [];

      // The backend may return strings or objects — handle both.
      return files.map((e) {
        if (e is Map<String, dynamic>) {
          return WorkspaceFileEntry.fromJson(e);
        }
        // Fallback: plain string path
        return WorkspaceFileEntry(path: e.toString());
      }).toList();
    } catch (e) {
      Log.w(_tag, 'Failed to list files for sandbox $sandboxId', e);
      return [];
    }
  }

  /// Get the content of a single file by [path].
  ///
  /// Returns empty string on error.
  Future<String> getFileContent(String sandboxId, String path) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/sandboxes/$sandboxId/workspace/file',
        queryParameters: {'path': path},
      );
      final data = response.data;
      return data?['content'] as String? ?? '';
    } catch (e) {
      Log.w(_tag, 'Failed to read file $path in sandbox $sandboxId', e);
      return '';
    }
  }

  /// Get detected preview ports from the sandbox.
  ///
  /// Returns an empty list on error.
  Future<List<PreviewPort>> getPreviewPorts(String sandboxId) async {
    try {
      final response = await _client.get<Map<String, dynamic>>(
        '/api/sandboxes/$sandboxId/preview/ports',
      );
      final data = response.data;
      if (data == null) return [];

      final ports = data['ports'] as List<dynamic>? ?? [];
      return ports
          .map((e) => PreviewPort.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      Log.w(_tag, 'Failed to get preview ports for sandbox $sandboxId', e);
      return [];
    }
  }
}
