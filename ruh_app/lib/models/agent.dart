/// Represents an agent record from the backend.
///
/// The class is named [Agent] for convenience; the backend JSON shape uses
/// snake_case keys which are mapped in [Agent.fromJson].
class Agent {
  final String id;
  final String name;
  final String avatar; // emoji like "🤖"
  final String description;
  final List<String> skills;
  final String triggerLabel;
  final String status; // active, draft, forging
  final List<String> sandboxIds;
  final String? forgeSandboxId;
  final List<dynamic>? skillGraph;
  final List<String> agentRules;
  final List<AgentRuntimeInput> runtimeInputs;
  final List<AgentToolConnection> toolConnections;
  final List<AgentTrigger> triggers;
  final List<AgentChannel> channels;
  final WorkspaceMemory? workspaceMemory;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Agent({
    required this.id,
    required this.name,
    this.avatar = '🤖',
    this.description = '',
    this.skills = const [],
    this.triggerLabel = '',
    this.status = 'draft',
    this.sandboxIds = const [],
    this.forgeSandboxId,
    this.skillGraph,
    this.agentRules = const [],
    this.runtimeInputs = const [],
    this.toolConnections = const [],
    this.triggers = const [],
    this.channels = const [],
    this.workspaceMemory,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Agent.fromJson(Map<String, dynamic> json) {
    return Agent(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      avatar: json['avatar'] as String? ?? '🤖',
      description: json['description'] as String? ?? '',
      skills: _stringList(json['skills']),
      triggerLabel: json['trigger_label'] as String? ?? '',
      status: json['status'] as String? ?? 'draft',
      sandboxIds: _stringList(json['sandbox_ids']),
      forgeSandboxId: json['forge_sandbox_id'] as String?,
      skillGraph: json['skill_graph'] as List<dynamic>?,
      agentRules: _stringList(json['agent_rules']),
      runtimeInputs:
          (json['runtime_inputs'] as List<dynamic>?)
              ?.map(
                (e) => AgentRuntimeInput.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      toolConnections:
          (json['tool_connections'] as List<dynamic>?)
              ?.map(
                (e) => AgentToolConnection.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      triggers:
          (json['triggers'] as List<dynamic>?)
              ?.map((e) => AgentTrigger.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      channels:
          (json['channels'] as List<dynamic>?)
              ?.map((e) => AgentChannel.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      workspaceMemory: json['workspace_memory'] != null
          ? WorkspaceMemory.fromJson(
              json['workspace_memory'] as Map<String, dynamic>,
            )
          : null,
      createdAt: DateTime.parse(
        json['created_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
      updatedAt: DateTime.parse(
        json['updated_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
    );
  }

  /// Whether the agent is in the active state.
  bool get isActive => status == 'active';

  /// Whether the agent has at least one deployed sandbox.
  bool get isDeployed => sandboxIds.isNotEmpty;

  /// Number of sandboxes currently associated with this agent.
  int get deploymentCount => sandboxIds.length;

  static List<String> _stringList(dynamic value) {
    if (value is List) {
      return value.map((e) => e.toString()).toList();
    }
    return const [];
  }
}

/// Backwards-compatible alias for code that still references [AgentRecord].
typedef AgentRecord = Agent;

/// A runtime input parameter required by the agent.
class AgentRuntimeInput {
  final String key;
  final String label;
  final String description;
  final bool required;
  final String value;

  const AgentRuntimeInput({
    required this.key,
    this.label = '',
    this.description = '',
    this.required = false,
    this.value = '',
  });

  factory AgentRuntimeInput.fromJson(Map<String, dynamic> json) {
    return AgentRuntimeInput(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      description: json['description'] as String? ?? '',
      required: json['required'] as bool? ?? false,
      value: json['value'] as String? ?? '',
    );
  }
}

/// A tool connection configured for the agent.
class AgentToolConnection {
  final String toolId;
  final String name;
  final String description;
  final String status;
  final String connectorType;

  const AgentToolConnection({
    required this.toolId,
    this.name = '',
    this.description = '',
    this.status = 'available',
    this.connectorType = 'api',
  });

  factory AgentToolConnection.fromJson(Map<String, dynamic> json) {
    return AgentToolConnection(
      toolId: json['tool_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      status: json['status'] as String? ?? 'available',
      connectorType: json['connector_type'] as String? ?? 'api',
    );
  }
}

/// A trigger that can activate agent behavior.
class AgentTrigger {
  final String id;
  final String title;
  final String kind;
  final String status;
  final String description;
  final String? schedule;

  const AgentTrigger({
    required this.id,
    this.title = '',
    this.kind = 'manual',
    this.status = '',
    this.description = '',
    this.schedule,
  });

  factory AgentTrigger.fromJson(Map<String, dynamic> json) {
    return AgentTrigger(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      kind: json['kind'] as String? ?? 'manual',
      status: json['status'] as String? ?? '',
      description: json['description'] as String? ?? '',
      schedule: json['schedule'] as String?,
    );
  }
}

/// A messaging channel the agent is connected to.
class AgentChannel {
  final String kind;
  final String status;
  final String label;
  final String description;

  const AgentChannel({
    required this.kind,
    this.status = '',
    this.label = '',
    this.description = '',
  });

  factory AgentChannel.fromJson(Map<String, dynamic> json) {
    return AgentChannel(
      kind: json['kind'] as String? ?? '',
      status: json['status'] as String? ?? '',
      label: json['label'] as String? ?? '',
      description: json['description'] as String? ?? '',
    );
  }
}

/// Workspace memory state for the agent.
class WorkspaceMemory {
  final String instructions;
  final String continuitySummary;
  final List<String> pinnedPaths;

  const WorkspaceMemory({
    this.instructions = '',
    this.continuitySummary = '',
    this.pinnedPaths = const [],
  });

  factory WorkspaceMemory.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemory(
      instructions: json['instructions'] as String? ?? '',
      continuitySummary: json['continuity_summary'] as String? ?? '',
      pinnedPaths:
          (json['pinned_paths'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'instructions': instructions,
      'continuity_summary': continuitySummary,
      'pinned_paths': pinnedPaths,
    };
  }
}
