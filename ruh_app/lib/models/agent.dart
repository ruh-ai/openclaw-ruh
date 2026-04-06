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

  /// Whether the agent has user_required runtime inputs that lack values.
  bool get hasMissingRequiredInputs => runtimeInputs.any(
    (input) => input.required && input.isUserRequired && !input.isFilled,
  );

  /// The user_required inputs that still need values.
  List<AgentRuntimeInput> get missingRequiredInputs => runtimeInputs
      .where((input) => input.required && input.isUserRequired && !input.isFilled)
      .toList();

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
  final String source;
  String value;

  /// How this variable should be populated:
  /// - `user_required` — secrets/credentials only the user can provide
  /// - `ai_inferred` — values the AI can suggest from agent context
  /// - `static_default` — values with hardcoded defaults
  final String populationStrategy;

  /// UI control type: text, boolean, number, select.
  final String inputType;

  /// Sensible default value.
  final String? defaultValue;

  /// Realistic example value shown as placeholder.
  final String? example;

  /// Fixed choices for select-type inputs.
  final List<String>? options;

  /// Category for grouping related inputs.
  final String? group;

  AgentRuntimeInput({
    required this.key,
    this.label = '',
    this.description = '',
    this.required = false,
    this.source = 'architect_requirement',
    this.value = '',
    this.populationStrategy = 'user_required',
    this.inputType = 'text',
    this.defaultValue,
    this.example,
    this.options,
    this.group,
  });

  factory AgentRuntimeInput.fromJson(Map<String, dynamic> json) {
    return AgentRuntimeInput(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      description: json['description'] as String? ?? '',
      required: json['required'] as bool? ?? false,
      source: json['source'] as String? ?? 'architect_requirement',
      value: json['value'] as String? ?? '',
      populationStrategy: json['populationStrategy'] as String? ?? 'user_required',
      inputType: json['inputType'] as String? ?? 'text',
      defaultValue: json['defaultValue'] as String?,
      example: json['example'] as String?,
      options: (json['options'] as List<dynamic>?)?.map((e) => e.toString()).toList(),
      group: json['group'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    'label': label,
    'description': description,
    'required': required,
    'source': source,
    'value': value,
    'populationStrategy': populationStrategy,
    'inputType': inputType,
    if (defaultValue != null) 'defaultValue': defaultValue,
    if (example != null) 'example': example,
    if (options != null) 'options': options,
    if (group != null) 'group': group,
  };

  /// Whether this input has an effective value (explicit or default).
  bool get isFilled =>
      value.trim().isNotEmpty || (defaultValue?.trim().isNotEmpty ?? false);

  /// Whether this is a user-required credential.
  bool get isUserRequired => populationStrategy == 'user_required';

  /// The effective display value (explicit value or default).
  String get effectiveValue =>
      value.trim().isNotEmpty ? value : (defaultValue ?? '');
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
      toolId: json['tool_id'] as String? ?? json['toolId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      status: json['status'] as String? ?? 'available',
      connectorType:
          json['connector_type'] as String? ??
          json['connectorType'] as String? ??
          'api',
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
  final DateTime? updatedAt;

  const WorkspaceMemory({
    this.instructions = '',
    this.continuitySummary = '',
    this.pinnedPaths = const [],
    this.updatedAt,
  });

  factory WorkspaceMemory.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemory(
      instructions: json['instructions'] as String? ?? '',
      continuitySummary:
          json['continuity_summary'] as String? ??
          json['continuitySummary'] as String? ??
          '',
      pinnedPaths:
          ((json['pinned_paths'] as List<dynamic>?) ??
                  (json['pinnedPaths'] as List<dynamic>?))
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      updatedAt: json['updated_at'] is String
          ? DateTime.tryParse(json['updated_at'] as String)
          : json['updatedAt'] is String
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'instructions': instructions,
      'continuitySummary': continuitySummary,
      'pinnedPaths': pinnedPaths,
    };
  }
}
