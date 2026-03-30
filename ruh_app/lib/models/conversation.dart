/// A conversation within a sandbox.
class Conversation {
  final String id;
  final String sandboxId;
  final String name;
  final int messageCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Conversation({
    required this.id,
    required this.sandboxId,
    required this.name,
    required this.messageCount,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] as String,
      sandboxId: json['sandbox_id'] as String,
      name: json['name'] as String? ?? 'Untitled',
      messageCount: (json['message_count'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'sandbox_id': sandboxId,
      'name': name,
      'message_count': messageCount,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

/// A single message in a conversation.
class Message {
  final String role;
  final String content;
  final MessageWorkspaceState? workspaceState;

  const Message({
    required this.role,
    required this.content,
    this.workspaceState,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final wsRaw = json['workspace_state'];
    return Message(
      role: json['role'] as String,
      content: json['content'] as String,
      workspaceState: wsRaw is Map<String, dynamic>
          ? MessageWorkspaceState.fromJson(wsRaw)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'role': role,
      'content': content,
      if (workspaceState != null) 'workspace_state': workspaceState!.toJson(),
    };
  }
}

/// Workspace state attached to a message, capturing browser and task progress.
class MessageWorkspaceState {
  final BrowserState? browser;
  final TaskState? task;

  const MessageWorkspaceState({this.browser, this.task});

  factory MessageWorkspaceState.fromJson(Map<String, dynamic> json) {
    return MessageWorkspaceState(
      browser: json['browser'] is Map<String, dynamic>
          ? BrowserState.fromJson(json['browser'] as Map<String, dynamic>)
          : null,
      task: json['task'] is Map<String, dynamic>
          ? TaskState.fromJson(json['task'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (browser != null) 'browser': browser!.toJson(),
      if (task != null) 'task': task!.toJson(),
    };
  }
}

/// Browser state captured during agent execution.
class BrowserState {
  final String? url;
  final String? title;
  final String? screenshotUrl;

  const BrowserState({this.url, this.title, this.screenshotUrl});

  factory BrowserState.fromJson(Map<String, dynamic> json) {
    return BrowserState(
      url: json['url'] as String?,
      title: json['title'] as String?,
      screenshotUrl: json['screenshot_url'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (url != null) 'url': url,
      if (title != null) 'title': title,
      if (screenshotUrl != null) 'screenshot_url': screenshotUrl,
    };
  }
}

/// Task execution state showing step-by-step progress.
class TaskState {
  final List<TaskStep> steps;

  const TaskState({this.steps = const []});

  factory TaskState.fromJson(Map<String, dynamic> json) {
    return TaskState(
      steps: (json['steps'] as List<dynamic>?)
              ?.map((e) => TaskStep.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'steps': steps.map((s) => s.toJson()).toList(),
    };
  }
}

/// A single step in a task execution sequence.
class TaskStep {
  final int id;
  final String kind;
  final String label;
  final String status;
  final String? detail;
  final String? toolName;
  final int? elapsedMs;

  const TaskStep({
    required this.id,
    this.kind = 'thinking',
    this.label = '',
    this.status = 'active',
    this.detail,
    this.toolName,
    this.elapsedMs,
  });

  factory TaskStep.fromJson(Map<String, dynamic> json) {
    return TaskStep(
      id: (json['id'] as num?)?.toInt() ?? 0,
      kind: json['kind'] as String? ?? 'thinking',
      label: json['label'] as String? ?? '',
      status: json['status'] as String? ?? 'active',
      detail: json['detail'] as String?,
      toolName: json['tool_name'] as String?,
      elapsedMs: (json['elapsed_ms'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'kind': kind,
      'label': label,
      'status': status,
      if (detail != null) 'detail': detail,
      if (toolName != null) 'tool_name': toolName,
      if (elapsedMs != null) 'elapsed_ms': elapsedMs,
    };
  }

  /// Whether this step has finished executing.
  bool get isDone => status == 'done';
}
