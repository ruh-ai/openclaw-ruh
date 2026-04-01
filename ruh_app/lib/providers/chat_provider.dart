import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/conversation_cache.dart';
import '../models/conversation.dart';
import '../services/api_client.dart';
import '../services/chat_service.dart';
import '../services/conversation_service.dart';
import '../services/logger.dart';
import '../services/notification_service.dart';

final chatServiceProvider = Provider<ChatService>((ref) {
  return ChatService(client: ApiClient());
});

final conversationServiceProvider = Provider<ConversationService>((ref) {
  return ConversationService(client: ApiClient());
});

/// A single step the agent performs (thinking or tool execution).
class ChatStep {
  final int id;
  final String kind; // 'thinking', 'tool'
  final String label;
  String status; // 'active', 'done'
  final String? detail;
  final String? toolName;
  final int startedAt;
  int? elapsedMs;

  ChatStep({
    required this.id,
    required this.kind,
    required this.label,
    this.status = 'active',
    this.detail,
    this.toolName,
    required this.startedAt,
    this.elapsedMs,
  });

  ChatStep copyWith({String? status, String? detail, int? elapsedMs}) {
    return ChatStep(
      id: id,
      kind: kind,
      label: label,
      status: status ?? this.status,
      detail: detail ?? this.detail,
      toolName: toolName,
      startedAt: startedAt,
      elapsedMs: elapsedMs ?? this.elapsedMs,
    );
  }
}

/// A single chat message in the UI.
class ChatMessage {
  final String role;
  String content;
  final List<ChatToolCall> toolCalls;
  final List<ChatStep> steps;
  bool isStreaming;

  ChatMessage({
    required this.role,
    this.content = '',
    List<ChatToolCall>? toolCalls,
    List<ChatStep>? steps,
    this.isStreaming = false,
  }) : toolCalls = toolCalls ?? [],
       steps = steps ?? [];
}

class ChatToolCall {
  final String name;
  final String? input;
  final String? output;

  const ChatToolCall({required this.name, this.input, this.output});
}

// ---------------------------------------------------------------------------
// Task plan (Manus-style parsed from markdown checkboxes)
// ---------------------------------------------------------------------------

class TaskPlanItem {
  final String label;
  String status; // 'pending', 'active', 'done'
  final List<TaskPlanItem> children;

  TaskPlanItem({
    required this.label,
    this.status = 'pending',
    List<TaskPlanItem>? children,
  }) : children = children ?? [];
}

class TaskPlan {
  final List<TaskPlanItem> items;

  TaskPlan({required this.items});

  int get currentIndex => items.indexWhere((i) => i.status != 'done');
  int get totalTasks => items.fold(0, (s, i) => s + 1 + i.children.length);
  int get completedTasks => items.fold(
    0,
    (s, i) =>
        s +
        (i.status == 'done' ? 1 : 0) +
        i.children.where((c) => c.status == 'done').length,
  );

  /// Parse task plan from markdown content containing checkboxes.
  static TaskPlan? tryParse(String content) {
    final lines = content.split('\n');
    final items = <TaskPlanItem>[];
    TaskPlanItem? lastParent;

    for (final line in lines) {
      // Match "- [x] text" or "- [ ] text" with optional indentation
      final match = RegExp(r'^(\s*)- \[([ xX])\] (.+)$').firstMatch(line);
      if (match == null) continue;

      final indent = match.group(1)!.length;
      final checked = match.group(2)!.toLowerCase() == 'x';
      final label = match.group(3)!.trim();

      final item = TaskPlanItem(
        label: label,
        status: checked ? 'done' : 'pending',
      );

      if (indent >= 2 && lastParent != null) {
        lastParent.children.add(item);
      } else {
        items.add(item);
        lastParent = item;
      }
    }

    if (items.isEmpty) return null;

    // Mark first non-done item as active
    for (final item in items) {
      if (item.status != 'done') {
        item.status = 'active';
        break;
      }
      // Check children
      for (final child in item.children) {
        if (child.status != 'done') {
          child.status = 'active';
          break;
        }
      }
    }

    return TaskPlan(items: items);
  }
}

// ---------------------------------------------------------------------------
// Terminal command (tracked from tool events)
// ---------------------------------------------------------------------------

class TerminalCommand {
  final int id;
  final String toolName;
  final String command;
  String? output;
  String status; // 'running', 'done'
  final int startedAt;
  int? elapsedMs;

  TerminalCommand({
    required this.id,
    required this.toolName,
    required this.command,
    this.output,
    this.status = 'running',
    required this.startedAt,
    this.elapsedMs,
  });
}

// ---------------------------------------------------------------------------
// Browser workspace state (tracked from tool events)
// ---------------------------------------------------------------------------

class BrowserNavItem {
  final String kind; // 'navigation', 'action', 'screenshot'
  final String? url;
  final String label;
  final String? detail;
  final int timestamp;

  const BrowserNavItem({
    required this.kind,
    this.url,
    required this.label,
    this.detail,
    required this.timestamp,
  });
}

class BrowserWorkspaceState {
  final List<BrowserNavItem> items;
  final String? latestScreenshotUrl;

  const BrowserWorkspaceState({
    this.items = const [],
    this.latestScreenshotUrl,
  });
}

// ---------------------------------------------------------------------------
// Workspace file tree
// ---------------------------------------------------------------------------

class WorkspaceFile {
  final String name;
  final String path;
  final bool isDirectory;
  final int? size;
  final List<WorkspaceFile> children;

  const WorkspaceFile({
    required this.name,
    required this.path,
    this.isDirectory = false,
    this.size,
    this.children = const [],
  });

  factory WorkspaceFile.fromJson(Map<String, dynamic> json) {
    return WorkspaceFile(
      name: json['name'] as String? ?? '',
      path: json['path'] as String? ?? '',
      isDirectory: json['is_directory'] as bool? ?? false,
      size: (json['size'] as num?)?.toInt(),
      children:
          (json['children'] as List<dynamic>?)
              ?.map((e) => WorkspaceFile.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

/// Chat state for a single sandbox conversation.
class ChatState {
  final String sandboxId;
  final List<ChatMessage> messages;
  final bool isStreaming;
  final String? conversationId;
  final String? error;
  final String? workspaceMemoryInstructions;
  final List<TerminalCommand> terminalCommands;
  final BrowserWorkspaceState browserState;
  final String? activeToolName;
  final TaskPlan? currentTaskPlan;

  const ChatState({
    required this.sandboxId,
    this.messages = const [],
    this.isStreaming = false,
    this.conversationId,
    this.error,
    this.workspaceMemoryInstructions,
    this.terminalCommands = const [],
    this.browserState = const BrowserWorkspaceState(),
    this.activeToolName,
    this.currentTaskPlan,
  });

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? isStreaming,
    String? conversationId,
    String? error,
    String? workspaceMemoryInstructions,
    List<TerminalCommand>? terminalCommands,
    BrowserWorkspaceState? browserState,
    String? activeToolName,
    TaskPlan? currentTaskPlan,
  }) {
    return ChatState(
      sandboxId: sandboxId,
      messages: messages ?? this.messages,
      isStreaming: isStreaming ?? this.isStreaming,
      conversationId: conversationId ?? this.conversationId,
      error: error,
      workspaceMemoryInstructions:
          workspaceMemoryInstructions ?? this.workspaceMemoryInstructions,
      terminalCommands: terminalCommands ?? this.terminalCommands,
      browserState: browserState ?? this.browserState,
      activeToolName: activeToolName,
      currentTaskPlan: currentTaskPlan ?? this.currentTaskPlan,
    );
  }
}

/// Manages chat state per sandbox. Handles sending messages, streaming
/// responses, and conversation lifecycle.
class ChatNotifier extends FamilyAsyncNotifier<ChatState, String> {
  StreamSubscription<ChatEvent>? _streamSub;
  int _stepIdCounter = 0;
  final ConversationCache _cache = ConversationCache();

  @override
  Future<ChatState> build(String sandboxId) async {
    // Load or create a conversation
    final convService = ref.read(conversationServiceProvider);
    String? conversationId;

    try {
      final convs = await convService.listConversations(sandboxId, limit: 1);
      if (convs.isNotEmpty) {
        conversationId = convs.first.id;
        // Load existing messages
        final msgs = await convService.getMessages(
          sandboxId,
          conversationId,
          limit: 50,
        );

        // Cache the data for offline use
        _cacheInBackground(sandboxId, convs, conversationId, msgs);

        final chatMessages = msgs.reversed
            .map((m) => ChatMessage(role: m.role, content: m.content))
            .toList();
        return ChatState(
          sandboxId: sandboxId,
          messages: chatMessages,
          conversationId: conversationId,
        );
      }
    } catch (_) {
      // Backend may not be running — try offline cache
      Log.i('Chat', 'API unavailable, falling back to offline cache');
      final cached = await _loadFromCache(sandboxId);
      if (cached != null) return cached;
    }

    // Fresh conversation
    try {
      final conv = await convService.createConversation(sandboxId);
      conversationId = conv.id;
    } catch (_) {
      // Will create on first message
    }

    return ChatState(
      sandboxId: sandboxId,
      conversationId: conversationId,
      messages: [
        ChatMessage(
          role: 'assistant',
          content: 'Hello! I\'m your Ruh agent. How can I help you today?',
        ),
      ],
    );
  }

  /// Write conversations and messages to the local cache (fire-and-forget).
  void _cacheInBackground(
    String sandboxId,
    List<Conversation> conversations,
    String conversationId,
    List<Message> messages,
  ) {
    Future(() async {
      try {
        await _cache.cacheConversations(sandboxId, conversations);
        await _cache.cacheMessages(conversationId, messages);
      } catch (e) {
        Log.w('Chat', 'Failed to write offline cache', e);
      }
    });
  }

  /// Attempt to load chat state from the offline cache.
  Future<ChatState?> _loadFromCache(String sandboxId) async {
    try {
      final cachedConvs = await _cache.getCachedConversations(sandboxId);
      if (cachedConvs.isEmpty) return null;

      final conversationId = cachedConvs.first.id;
      final cachedMsgs = await _cache.getCachedMessages(conversationId);

      final chatMessages = cachedMsgs.reversed
          .map((m) => ChatMessage(role: m.role, content: m.content))
          .toList();

      if (chatMessages.isEmpty) return null;

      Log.i(
        'Chat',
        'Loaded ${chatMessages.length} messages from offline cache',
      );
      return ChatState(
        sandboxId: sandboxId,
        messages: chatMessages,
        conversationId: conversationId,
      );
    } catch (e) {
      Log.w('Chat', 'Offline cache read failed', e);
      return null;
    }
  }

  /// Send a user message and stream the response.
  ///
  /// Optionally pass a [model] to override the default LLM model.
  Future<void> sendMessage(String text, {String? model}) async {
    final current = state.valueOrNull;
    if (current == null || current.isStreaming) return;

    // Add user message
    final messages = [...current.messages];
    messages.add(ChatMessage(role: 'user', content: text));

    // Add empty assistant placeholder
    final assistantMsg = ChatMessage(
      role: 'assistant',
      content: '',
      isStreaming: true,
    );
    messages.add(assistantMsg);

    // If this is the first user message and we have workspace memory,
    // include it as context via system instructions.
    final isFirstUserMessage =
        messages.where((m) => m.role == 'user').length == 1;
    final memoryInstructions = current.workspaceMemoryInstructions;

    state = AsyncData(
      current.copyWith(messages: messages, isStreaming: true, error: null),
    );

    // Reset step counter for this response
    _stepIdCounter = 0;

    // Build the message to send — prepend workspace memory as system context
    // for the first message in a new conversation.
    String effectiveMessage = text;
    if (isFirstUserMessage &&
        memoryInstructions != null &&
        memoryInstructions.isNotEmpty) {
      effectiveMessage =
          '[System context — workspace memory]\n$memoryInstructions\n\n[User message]\n$text';
    }

    // Stream from the real backend
    final chatService = ref.read(chatServiceProvider);
    try {
      final stream = chatService.sendMessage(
        sandboxId: current.sandboxId,
        message: effectiveMessage,
        conversationId: current.conversationId,
        model: model,
      );

      await for (final event in stream) {
        final curr = state.valueOrNull;
        if (curr == null) break;
        final msgs = [...curr.messages];
        final lastIdx = msgs.length - 1;
        final lastMsg = msgs[lastIdx];

        switch (event.type) {
          case ChatEventType.textDelta:
            final newContent = lastMsg.content + (event.content ?? '');
            msgs[lastIdx] = ChatMessage(
              role: 'assistant',
              content: newContent,
              toolCalls: lastMsg.toolCalls,
              steps: lastMsg.steps,
              isStreaming: true,
            );
            // Parse task plan from accumulated content
            TaskPlan? parsedPlan;
            final planMatch = RegExp(
              r'<plan>([\s\S]*?)</plan>',
              multiLine: true,
            ).firstMatch(newContent);
            if (planMatch != null) {
              final planBody = planMatch.group(1)!;
              final planItems = <TaskPlanItem>[];
              for (final line in planBody.split('\n')) {
                final trimmed = line.trim();
                if (trimmed.isEmpty) continue;
                final m = RegExp(
                  r'^(?:\d+\.\s*|-\s*|\*\s*)(.+)$',
                ).firstMatch(trimmed);
                if (m != null) {
                  planItems.add(TaskPlanItem(label: m.group(1)!.trim()));
                }
              }
              // Apply task_update tags
              final updates = RegExp(
                r'<task_update\s+index="(\d+)"\s+status="(\w+)"\s*/?>',
              ).allMatches(newContent);
              for (final upd in updates) {
                final idx = int.tryParse(upd.group(1)!) ?? -1;
                final status = upd.group(2)!;
                if (idx >= 0 && idx < planItems.length) {
                  planItems[idx].status = status;
                }
              }
              // Mark first non-done as active
              bool foundActive = false;
              for (final item in planItems) {
                if (item.status != 'done' && !foundActive) {
                  item.status = 'active';
                  foundActive = true;
                }
              }
              if (planItems.isNotEmpty) {
                parsedPlan = TaskPlan(items: planItems);
              }
            }
            state = AsyncData(
              curr.copyWith(messages: msgs, currentTaskPlan: parsedPlan),
            );
            break;

          case ChatEventType.toolStart:
            final toolName = event.toolName ?? 'tool';
            final now = DateTime.now().millisecondsSinceEpoch;
            final step = ChatStep(
              id: _stepIdCounter++,
              kind: 'tool',
              label: toolName,
              status: 'active',
              toolName: toolName,
              startedAt: now,
            );
            lastMsg.steps.add(step);
            lastMsg.toolCalls.add(
              ChatToolCall(name: toolName, input: event.toolInput),
            );
            msgs[lastIdx] = lastMsg;

            // Track terminal commands for the computer view
            final termCmds = [...curr.terminalCommands];
            const terminalTools = {'bash', 'exec', 'shell', 'bash_tool'};
            if (terminalTools.contains(toolName)) {
              termCmds.add(
                TerminalCommand(
                  id: termCmds.length,
                  toolName: toolName,
                  command: event.toolInput ?? '',
                  startedAt: now,
                ),
              );
            }

            // Track browser navigation
            var browserState = curr.browserState;
            const browserTools = {
              'browser_navigate',
              'browser_click',
              'browser_input',
              'browser_scroll',
              'web_search',
            };
            if (browserTools.contains(toolName)) {
              final items = [...browserState.items];
              items.add(
                BrowserNavItem(
                  kind: toolName.contains('navigate') ? 'navigation' : 'action',
                  label: toolName,
                  detail: event.toolInput,
                  timestamp: now,
                ),
              );
              browserState = BrowserWorkspaceState(
                items: items,
                latestScreenshotUrl: browserState.latestScreenshotUrl,
              );
            }

            state = AsyncData(
              curr.copyWith(
                messages: msgs,
                terminalCommands: termCmds,
                browserState: browserState,
                activeToolName: toolName,
              ),
            );
            break;

          case ChatEventType.toolEnd:
            final now = DateTime.now().millisecondsSinceEpoch;
            // Mark the last active tool step as done
            if (lastMsg.steps.isNotEmpty) {
              final activeStepIdx = lastMsg.steps.lastIndexWhere(
                (s) => s.kind == 'tool' && s.status == 'active',
              );
              if (activeStepIdx >= 0) {
                final activeStep = lastMsg.steps[activeStepIdx];
                lastMsg.steps[activeStepIdx] = activeStep.copyWith(
                  status: 'done',
                  elapsedMs: now - activeStep.startedAt,
                );
              }
            }
            // Update last tool call with output
            if (lastMsg.toolCalls.isNotEmpty) {
              final tools = [...lastMsg.toolCalls];
              final lastTool = tools.last;
              tools[tools.length - 1] = ChatToolCall(
                name: lastTool.name,
                input: lastTool.input,
                output: event.content,
              );
              msgs[lastIdx] = ChatMessage(
                role: 'assistant',
                content: lastMsg.content,
                toolCalls: tools,
                steps: lastMsg.steps,
                isStreaming: true,
              );
            }

            // Mark terminal command as done
            final termCmds = [...curr.terminalCommands];
            final runningIdx = termCmds.lastIndexWhere(
              (c) => c.status == 'running',
            );
            if (runningIdx >= 0) {
              termCmds[runningIdx]
                ..status = 'done'
                ..output = event.content
                ..elapsedMs = now - termCmds[runningIdx].startedAt;
            }

            state = AsyncData(
              curr.copyWith(
                messages: msgs,
                terminalCommands: termCmds,
                activeToolName: null,
              ),
            );
            break;

          case ChatEventType.done:
            // Mark any remaining active steps as done
            for (var i = 0; i < lastMsg.steps.length; i++) {
              if (lastMsg.steps[i].status == 'active') {
                lastMsg.steps[i] = lastMsg.steps[i].copyWith(
                  status: 'done',
                  elapsedMs:
                      DateTime.now().millisecondsSinceEpoch -
                      lastMsg.steps[i].startedAt,
                );
              }
            }
            msgs[lastIdx] = ChatMessage(
              role: 'assistant',
              content: lastMsg.content,
              toolCalls: lastMsg.toolCalls,
              steps: lastMsg.steps,
              isStreaming: false,
            );
            if (lastMsg.toolCalls.isNotEmpty) {
              NotificationService().notifyTaskComplete(
                'Agent',
                lastMsg.content,
              );
            }
            state = AsyncData(
              curr.copyWith(messages: msgs, isStreaming: false),
            );
            break;

          case ChatEventType.error:
            NotificationService().notifyAgentError(
              'Agent',
              event.content ?? 'Unknown error',
            );
            state = AsyncData(
              curr.copyWith(
                isStreaming: false,
                error: event.content ?? 'Unknown error',
              ),
            );
            break;

          case ChatEventType.status:
            // Check if the status message indicates thinking
            final statusMsg = event.content ?? '';
            if (statusMsg.toLowerCase().contains('thinking')) {
              final step = ChatStep(
                id: _stepIdCounter++,
                kind: 'thinking',
                label: statusMsg,
                status: 'active',
                startedAt: DateTime.now().millisecondsSinceEpoch,
              );
              lastMsg.steps.add(step);
              msgs[lastIdx] = lastMsg;
              state = AsyncData(curr.copyWith(messages: msgs));
            }
            break;
        }
      }
    } catch (e) {
      final curr = state.valueOrNull;
      if (curr != null) {
        // Mark streaming as done, show error
        final msgs = [...curr.messages];
        if (msgs.isNotEmpty && msgs.last.isStreaming) {
          msgs[msgs.length - 1] = ChatMessage(
            role: 'assistant',
            content: msgs.last.content.isEmpty
                ? 'Failed to connect to the agent. Is the backend running?'
                : msgs.last.content,
            steps: msgs.last.steps,
            isStreaming: false,
          );
        }
        state = AsyncData(
          curr.copyWith(
            messages: msgs,
            isStreaming: false,
            error: e.toString(),
          ),
        );
      }
    }
  }

  /// Set workspace memory instructions for the current conversation.
  void setWorkspaceMemory(String instructions) {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(workspaceMemoryInstructions: instructions),
    );
  }

  /// Start a new conversation.
  Future<void> newConversation() async {
    final current = state.valueOrNull;
    if (current == null) return;

    String? newConvId;
    try {
      final convService = ref.read(conversationServiceProvider);
      final conv = await convService.createConversation(current.sandboxId);
      newConvId = conv.id;
    } catch (_) {}

    state = AsyncData(
      ChatState(
        sandboxId: current.sandboxId,
        conversationId: newConvId,
        workspaceMemoryInstructions: current.workspaceMemoryInstructions,
        messages: [
          ChatMessage(
            role: 'assistant',
            content: 'Hello! I\'m your Ruh agent. How can I help you today?',
          ),
        ],
      ),
    );
  }

  /// Load an existing conversation by [conversationId].
  ///
  /// Fetches messages from the API, replaces the current message list, and
  /// updates the selected conversation ID in state.
  Future<void> loadConversation(String conversationId) async {
    final current = state.valueOrNull;
    if (current == null) return;

    state = const AsyncLoading();

    try {
      final convService = ref.read(conversationServiceProvider);
      final msgs = await convService.getMessages(
        current.sandboxId,
        conversationId,
        limit: 50,
      );

      final chatMessages = msgs.reversed
          .map((m) => ChatMessage(role: m.role, content: m.content))
          .toList();

      // If the conversation has no messages, add a greeting
      if (chatMessages.isEmpty) {
        chatMessages.add(
          ChatMessage(
            role: 'assistant',
            content: 'Hello! I\'m your Ruh agent. How can I help you today?',
          ),
        );
      }

      state = AsyncData(
        ChatState(
          sandboxId: current.sandboxId,
          conversationId: conversationId,
          messages: chatMessages,
          workspaceMemoryInstructions: current.workspaceMemoryInstructions,
        ),
      );

      // Cache in the background
      final convs = await convService.listConversations(
        current.sandboxId,
        limit: 1,
      );
      _cacheInBackground(current.sandboxId, convs, conversationId, msgs);
    } catch (e) {
      Log.e('Chat', 'Failed to load conversation $conversationId', e);
      state = AsyncData(
        ChatState(
          sandboxId: current.sandboxId,
          conversationId: conversationId,
          error: 'Failed to load conversation: $e',
          messages: [
            ChatMessage(
              role: 'assistant',
              content:
                  'Failed to load conversation history. You can still send a message.',
            ),
          ],
          workspaceMemoryInstructions: current.workspaceMemoryInstructions,
        ),
      );
    }
  }

  /// Switch to a different conversation. Alias for [loadConversation].
  Future<void> switchConversation(String conversationId) async {
    await loadConversation(conversationId);
  }

  void onDispose() {
    _streamSub?.cancel();
  }
}

final chatProvider =
    AsyncNotifierProvider.family<ChatNotifier, ChatState, String>(
      ChatNotifier.new,
    );
