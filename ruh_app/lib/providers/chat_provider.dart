import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_client.dart';
import '../services/chat_service.dart';
import '../services/conversation_service.dart';


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

  ChatStep copyWith({
    String? status,
    String? detail,
    int? elapsedMs,
  }) {
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
  })  : toolCalls = toolCalls ?? [],
        steps = steps ?? [];
}

class ChatToolCall {
  final String name;
  final String? input;
  final String? output;

  const ChatToolCall({required this.name, this.input, this.output});
}

/// Chat state for a single sandbox conversation.
class ChatState {
  final String sandboxId;
  final List<ChatMessage> messages;
  final bool isStreaming;
  final String? conversationId;
  final String? error;
  final String? workspaceMemoryInstructions;

  const ChatState({
    required this.sandboxId,
    this.messages = const [],
    this.isStreaming = false,
    this.conversationId,
    this.error,
    this.workspaceMemoryInstructions,
  });

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? isStreaming,
    String? conversationId,
    String? error,
    String? workspaceMemoryInstructions,
  }) {
    return ChatState(
      sandboxId: sandboxId,
      messages: messages ?? this.messages,
      isStreaming: isStreaming ?? this.isStreaming,
      conversationId: conversationId ?? this.conversationId,
      error: error,
      workspaceMemoryInstructions:
          workspaceMemoryInstructions ?? this.workspaceMemoryInstructions,
    );
  }
}

/// Manages chat state per sandbox. Handles sending messages, streaming
/// responses, and conversation lifecycle.
class ChatNotifier extends FamilyAsyncNotifier<ChatState, String> {
  StreamSubscription<ChatEvent>? _streamSub;
  int _stepIdCounter = 0;

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
        final chatMessages = msgs.reversed.map((m) => ChatMessage(
          role: m.role,
          content: m.content,
        )).toList();
        return ChatState(
          sandboxId: sandboxId,
          messages: chatMessages,
          conversationId: conversationId,
        );
      }
    } catch (_) {
      // Backend may not be running — start with empty state
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

    state = AsyncData(current.copyWith(
      messages: messages,
      isStreaming: true,
      error: null,
    ));

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
            msgs[lastIdx] = ChatMessage(
              role: 'assistant',
              content: lastMsg.content + (event.content ?? ''),
              toolCalls: lastMsg.toolCalls,
              steps: lastMsg.steps,
              isStreaming: true,
            );
            state = AsyncData(curr.copyWith(messages: msgs));
            break;

          case ChatEventType.toolStart:
            final step = ChatStep(
              id: _stepIdCounter++,
              kind: 'tool',
              label: event.toolName ?? 'Tool execution',
              status: 'active',
              toolName: event.toolName,
              startedAt: DateTime.now().millisecondsSinceEpoch,
            );
            lastMsg.steps.add(step);
            lastMsg.toolCalls.add(ChatToolCall(
              name: event.toolName ?? 'tool',
              input: event.toolInput,
            ));
            msgs[lastIdx] = lastMsg;
            state = AsyncData(curr.copyWith(messages: msgs));
            break;

          case ChatEventType.toolEnd:
            // Mark the last active tool step as done
            if (lastMsg.steps.isNotEmpty) {
              final activeStepIdx = lastMsg.steps.lastIndexWhere(
                (s) => s.kind == 'tool' && s.status == 'active',
              );
              if (activeStepIdx >= 0) {
                final activeStep = lastMsg.steps[activeStepIdx];
                lastMsg.steps[activeStepIdx] = activeStep.copyWith(
                  status: 'done',
                  elapsedMs: DateTime.now().millisecondsSinceEpoch -
                      activeStep.startedAt,
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
              state = AsyncData(curr.copyWith(messages: msgs));
            }
            break;

          case ChatEventType.done:
            // Mark any remaining active steps as done
            for (var i = 0; i < lastMsg.steps.length; i++) {
              if (lastMsg.steps[i].status == 'active') {
                lastMsg.steps[i] = lastMsg.steps[i].copyWith(
                  status: 'done',
                  elapsedMs: DateTime.now().millisecondsSinceEpoch -
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
            state = AsyncData(curr.copyWith(
              messages: msgs,
              isStreaming: false,
            ));
            break;

          case ChatEventType.error:
            state = AsyncData(curr.copyWith(
              isStreaming: false,
              error: event.content ?? 'Unknown error',
            ));
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
        state = AsyncData(curr.copyWith(
          messages: msgs,
          isStreaming: false,
          error: e.toString(),
        ));
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

    state = AsyncData(ChatState(
      sandboxId: current.sandboxId,
      conversationId: newConvId,
      workspaceMemoryInstructions: current.workspaceMemoryInstructions,
      messages: [
        ChatMessage(
          role: 'assistant',
          content: 'Hello! I\'m your Ruh agent. How can I help you today?',
        ),
      ],
    ));
  }

  void onDispose() {
    _streamSub?.cancel();
  }
}

final chatProvider =
    AsyncNotifierProvider.family<ChatNotifier, ChatState, String>(
  ChatNotifier.new,
);
