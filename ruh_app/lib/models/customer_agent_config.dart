import 'agent.dart';

class CustomerConfigAgentSummary {
  final String id;
  final String name;
  final String avatar;
  final String description;
  final String status;
  final List<String> sandboxIds;
  final DateTime createdAt;
  final DateTime updatedAt;

  const CustomerConfigAgentSummary({
    required this.id,
    required this.name,
    required this.avatar,
    required this.description,
    required this.status,
    required this.sandboxIds,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CustomerConfigAgentSummary.fromJson(Map<String, dynamic> json) {
    return CustomerConfigAgentSummary(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      avatar: json['avatar'] as String? ?? '🤖',
      description: json['description'] as String? ?? '',
      status: json['status'] as String? ?? 'draft',
      sandboxIds: ((json['sandboxIds'] as List<dynamic>?) ?? const [])
          .map((item) => item.toString())
          .toList(),
      createdAt: DateTime.parse(
        json['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      ),
      updatedAt: DateTime.parse(
        json['updatedAt'] as String? ?? DateTime.now().toIso8601String(),
      ),
    );
  }
}

class CustomerConfigWorkspaceMemory {
  final String instructions;
  final String continuitySummary;
  final List<String> pinnedPaths;
  final DateTime? updatedAt;

  const CustomerConfigWorkspaceMemory({
    this.instructions = '',
    this.continuitySummary = '',
    this.pinnedPaths = const [],
    this.updatedAt,
  });

  factory CustomerConfigWorkspaceMemory.fromJson(Map<String, dynamic> json) {
    return CustomerConfigWorkspaceMemory(
      instructions: json['instructions'] as String? ?? '',
      continuitySummary: json['continuitySummary'] as String? ?? '',
      pinnedPaths:
          (json['pinnedPaths'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .toList() ??
          const [],
      updatedAt: json['updatedAt'] is String
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
    );
  }
}

class RuntimeInputValueUpdate {
  final String key;
  final String value;

  const RuntimeInputValueUpdate({required this.key, required this.value});

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'value': value,
    };
  }
}

class CustomerAgentConfig {
  final CustomerConfigAgentSummary agent;
  final List<String> skills;
  final List<String> agentRules;
  final List<AgentRuntimeInput> runtimeInputs;
  final List<AgentToolConnection> toolConnections;
  final List<AgentTrigger> triggers;
  final List<AgentChannel> channels;
  final CustomerConfigWorkspaceMemory workspaceMemory;
  final Map<String, dynamic>? creationSession;

  const CustomerAgentConfig({
    required this.agent,
    this.skills = const [],
    this.agentRules = const [],
    this.runtimeInputs = const [],
    this.toolConnections = const [],
    this.triggers = const [],
    this.channels = const [],
    this.workspaceMemory = const CustomerConfigWorkspaceMemory(),
    this.creationSession,
  });

  factory CustomerAgentConfig.fromJson(Map<String, dynamic> json) {
    final creationSession = json['creationSession'];
    return CustomerAgentConfig(
      agent: CustomerConfigAgentSummary.fromJson(
        (json['agent'] as Map<String, dynamic>?) ?? const {},
      ),
      skills:
          (json['skills'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .toList() ??
          const [],
      agentRules:
          (json['agentRules'] as List<dynamic>?)
              ?.map((item) => item.toString())
              .toList() ??
          const [],
      runtimeInputs:
          (json['runtimeInputs'] as List<dynamic>?)
              ?.map(
                (item) =>
                    AgentRuntimeInput.fromJson(item as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      toolConnections:
          (json['toolConnections'] as List<dynamic>?)
              ?.map(
                (item) =>
                    AgentToolConnection.fromJson(item as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      triggers:
          (json['triggers'] as List<dynamic>?)
              ?.map(
                (item) => AgentTrigger.fromJson(item as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      channels:
          (json['channels'] as List<dynamic>?)
              ?.map(
                (item) => AgentChannel.fromJson(item as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      workspaceMemory: CustomerConfigWorkspaceMemory.fromJson(
        (json['workspaceMemory'] as Map<String, dynamic>?) ?? const {},
      ),
      creationSession: creationSession is Map<String, dynamic>
          ? creationSession
          : null,
    );
  }
}
