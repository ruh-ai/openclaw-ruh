/// Represents a sandbox (Docker container) running an OpenClaw agent.
class SandboxRecord {
  final String sandboxId;
  final String sandboxName;
  final String sandboxState;
  final String? standardUrl;
  final String? gatewayToken;
  final int gatewayPort;
  final bool approved;
  final int? vncPort;
  final String? dashboardUrl;
  final Map<int, int> previewPorts;
  final DateTime createdAt;

  const SandboxRecord({
    required this.sandboxId,
    required this.sandboxName,
    required this.sandboxState,
    this.standardUrl,
    this.gatewayToken,
    required this.gatewayPort,
    required this.approved,
    this.vncPort,
    this.dashboardUrl,
    this.previewPorts = const {},
    required this.createdAt,
  });

  factory SandboxRecord.fromJson(Map<String, dynamic> json) {
    return SandboxRecord(
      sandboxId: json['sandbox_id'] as String,
      sandboxName: json['sandbox_name'] as String,
      sandboxState: json['sandbox_state'] as String,
      standardUrl: json['standard_url'] as String?,
      gatewayToken: json['gateway_token'] as String?,
      gatewayPort: (json['gateway_port'] as num?)?.toInt() ?? 0,
      approved: json['approved'] as bool? ?? false,
      vncPort: (json['vnc_port'] as num?)?.toInt(),
      dashboardUrl: json['dashboard_url'] as String?,
      previewPorts: _parsePreviewPorts(json['preview_ports']),
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'sandbox_id': sandboxId,
      'sandbox_name': sandboxName,
      'sandbox_state': sandboxState,
      'standard_url': standardUrl,
      'gateway_token': gatewayToken,
      'gateway_port': gatewayPort,
      'approved': approved,
      if (vncPort != null) 'vnc_port': vncPort,
      if (dashboardUrl != null) 'dashboard_url': dashboardUrl,
      if (previewPorts.isNotEmpty)
        'preview_ports': previewPorts.map((k, v) => MapEntry(k.toString(), v)),
      'created_at': createdAt.toIso8601String(),
    };
  }

  /// Parses preview_ports from JSON.
  ///
  /// The backend may send this as `{ "3000": 32100, "8080": 32101 }` with
  /// string keys, or as `{ 3000: 32100 }` with integer keys.
  static Map<int, int> _parsePreviewPorts(dynamic value) {
    if (value is Map) {
      final result = <int, int>{};
      for (final entry in value.entries) {
        final key = entry.key is int
            ? entry.key as int
            : int.tryParse(entry.key.toString());
        final val = entry.value is int
            ? entry.value as int
            : (entry.value as num?)?.toInt();
        if (key != null && val != null) {
          result[key] = val;
        }
      }
      return result;
    }
    return const {};
  }
}

/// Health status of a sandbox.
class SandboxHealth {
  final bool isRunning;
  final String? gatewayStatus;
  final int? gatewayPort;
  final DateTime? deployedAt;
  final int conversationCount;

  const SandboxHealth({
    required this.isRunning,
    this.gatewayStatus,
    this.gatewayPort,
    this.deployedAt,
    this.conversationCount = 0,
  });

  factory SandboxHealth.fromJson(Map<String, dynamic> json) {
    return SandboxHealth(
      isRunning: json['is_running'] as bool? ?? false,
      gatewayStatus: json['gateway_status'] as String?,
      gatewayPort: (json['gateway_port'] as num?)?.toInt(),
      deployedAt: json['deployed_at'] != null
          ? DateTime.tryParse(json['deployed_at'] as String)
          : null,
      conversationCount: (json['conversation_count'] as num?)?.toInt() ?? 0,
    );
  }

  /// Alias for [isRunning] to match the backend JSON field name.
  bool get running => isRunning;

  /// Whether the gateway is responding normally.
  bool get isHealthy => gatewayStatus == 'healthy';
}
