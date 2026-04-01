import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/responsive.dart';
import '../../../config/theme.dart';
import '../../../models/conversation.dart';
import '../../../providers/chat_provider.dart';
import '../../../providers/conversation_list_provider.dart';
import '../../../utils/error_formatter.dart';
import '../../../widgets/skeleton_loader.dart';

/// Conversation history tab showing a list of all chats for the active sandbox.
///
/// Features:
/// - Fetches conversations on mount via [conversationListProvider]
/// - "New Chat" creates a conversation via POST and switches to it
/// - Each tile shows name, message count, relative time
/// - Long-press or edit icon triggers rename dialog
/// - Delete with confirmation dialog
/// - "Load more" pagination at the bottom
class TabAllChats extends ConsumerStatefulWidget {
  final String? sandboxId;
  final ValueChanged<String> onOpenConversation;

  const TabAllChats({
    super.key,
    required this.sandboxId,
    required this.onOpenConversation,
  });

  @override
  ConsumerState<TabAllChats> createState() => _TabAllChatsState();
}

class _TabAllChatsState extends ConsumerState<TabAllChats> {
  final List<Conversation> _conversations = [];
  bool _isLoadingMore = false;
  bool _hasMore = true;
  bool _isCreating = false;
  String? _error;
  bool _initialLoading = true;

  @override
  void initState() {
    super.initState();
    if (widget.sandboxId != null) {
      _loadInitial();
    }
  }

  @override
  void didUpdateWidget(TabAllChats oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sandboxId != widget.sandboxId && widget.sandboxId != null) {
      _conversations.clear();
      _hasMore = true;
      _loadInitial();
    }
  }

  Future<void> _loadInitial() async {
    setState(() {
      _initialLoading = true;
      _error = null;
    });
    try {
      final convService = ref.read(conversationServiceProvider);
      final convs = await convService.listConversations(
        widget.sandboxId!,
        limit: 20,
      );
      if (mounted) {
        setState(() {
          _conversations
            ..clear()
            ..addAll(convs);
          _hasMore = convs.length >= 20;
          _initialLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = formatError(e);
          _initialLoading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore || !_hasMore || widget.sandboxId == null) return;
    setState(() => _isLoadingMore = true);
    try {
      final convService = ref.read(conversationServiceProvider);
      final convs = await convService.listConversations(
        widget.sandboxId!,
        limit: 20,
      );
      // Simple offset pagination: skip already loaded conversations
      final newConvs = convs
          .where((c) => !_conversations.any((existing) => existing.id == c.id))
          .toList();
      if (mounted) {
        setState(() {
          _conversations.addAll(newConvs);
          _hasMore = newConvs.isNotEmpty;
          _isLoadingMore = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingMore = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load more: ${formatError(e)}')),
        );
      }
    }
  }

  Future<void> _createNewChat() async {
    if (widget.sandboxId == null || _isCreating) return;
    setState(() => _isCreating = true);
    try {
      final convService = ref.read(conversationServiceProvider);
      final conv = await convService.createConversation(widget.sandboxId!);
      // Refresh the list to include the new conversation
      await _loadInitial();
      // Switch to the new conversation in the chat tab
      ref
          .read(chatProvider(widget.sandboxId!).notifier)
          .switchConversation(conv.id);
      widget.onOpenConversation(conv.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to create conversation: ${formatError(e)}'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  Future<void> _deleteConversation(Conversation conv) async {
    if (widget.sandboxId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete conversation?'),
        content: Text('This will permanently delete "${conv.name}".'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: RuhTheme.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        final convService = ref.read(conversationServiceProvider);
        await convService.deleteConversation(widget.sandboxId!, conv.id);
        setState(() {
          _conversations.removeWhere((c) => c.id == conv.id);
        });
        // Also invalidate the conversation list provider so other widgets stay in sync
        ref.invalidate(conversationListProvider(widget.sandboxId!));
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete: ${formatError(e)}')),
          );
        }
      }
    }
  }

  Future<void> _renameConversation(Conversation conv) async {
    if (widget.sandboxId == null) return;

    final controller = TextEditingController(text: conv.name);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename conversation'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Conversation name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Rename'),
          ),
        ],
      ),
    );

    controller.dispose();

    if (newName != null && newName.isNotEmpty && newName != conv.name) {
      try {
        final convService = ref.read(conversationServiceProvider);
        await convService.renameConversation(
          widget.sandboxId!,
          conv.id,
          newName,
        );
        // Refresh to show updated name
        await _loadInitial();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to rename: ${formatError(e)}')),
          );
        }
      }
    }
  }

  void _openConversation(Conversation conv) {
    if (widget.sandboxId == null) return;
    // Load the conversation messages into the chat provider and switch
    ref
        .read(chatProvider(widget.sandboxId!).notifier)
        .loadConversation(conv.id);
    widget.onOpenConversation(conv.id);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (widget.sandboxId == null) {
      return const Center(
        child: Text(
          'No sandbox selected.',
          style: TextStyle(color: RuhTheme.textTertiary),
        ),
      );
    }

    return Column(
      children: [
        // New Chat button
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            height: 44,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: _isCreating ? null : RuhTheme.brandGradient,
                color: _isCreating ? Colors.grey.shade400 : null,
                borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
              ),
              child: MaterialButton(
                onPressed: _isCreating ? null : _createNewChat,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
                ),
                child: _isCreating
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            LucideIcons.plus,
                            size: IconSizes.md,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'New Chat',
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),

        // Conversation list
        Expanded(
          child: _initialLoading
              ? ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: const [
                    ConversationSkeleton(),
                    ConversationSkeleton(),
                    ConversationSkeleton(),
                    ConversationSkeleton(),
                  ],
                )
              : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        LucideIcons.alertCircle,
                        size: 32,
                        color: RuhTheme.error,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Failed to load conversations',
                        style: theme.textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _error!,
                        style: const TextStyle(
                          fontSize: 12,
                          color: RuhTheme.textTertiary,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      TextButton.icon(
                        onPressed: _loadInitial,
                        icon: const Icon(
                          LucideIcons.refreshCw,
                          size: IconSizes.sm,
                        ),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _conversations.isEmpty
              ? _buildEmptyState(theme)
              : _buildConversationList(theme),
        ),
      ],
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            LucideIcons.messageSquare,
            size: 40,
            color: RuhTheme.textTertiary,
          ),
          const SizedBox(height: 12),
          Text('No conversations yet', style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          const Text(
            'Create a new chat to get started.',
            style: TextStyle(fontSize: 13, color: RuhTheme.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildConversationList(ThemeData theme) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      // +1 for the "Load more" button at the bottom
      itemCount: _conversations.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _conversations.length) {
          // Load more button
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Center(
              child: _isLoadingMore
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : TextButton.icon(
                      onPressed: _loadMore,
                      icon: const Icon(
                        LucideIcons.chevronDown,
                        size: IconSizes.sm,
                      ),
                      label: const Text('Load more'),
                    ),
            ),
          );
        }

        final conv = _conversations[index];
        return _ConversationTile(
          conversation: conv,
          onOpen: () => _openConversation(conv),
          onRename: () => _renameConversation(conv),
          onDelete: () => _deleteConversation(conv),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Conversation tile
// ---------------------------------------------------------------------------

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  final VoidCallback onOpen;
  final VoidCallback onRename;
  final VoidCallback onDelete;

  const _ConversationTile({
    required this.conversation,
    required this.onOpen,
    required this.onRename,
    required this.onDelete,
  });

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    // Show month name for older conversations
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onOpen,
        onLongPress: onRename,
        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Icon(
                LucideIcons.messageSquare,
                size: 18,
                color: RuhTheme.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.name,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          '${conversation.messageCount} messages',
                          style: const TextStyle(
                            fontSize: 12,
                            color: RuhTheme.textTertiary,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          width: 3,
                          height: 3,
                          decoration: const BoxDecoration(
                            color: RuhTheme.textTertiary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _timeAgo(conversation.updatedAt),
                          style: const TextStyle(
                            fontSize: 12,
                            color: RuhTheme.textTertiary,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(LucideIcons.edit3, size: IconSizes.md),
                onPressed: onRename,
                tooltip: 'Rename conversation',
                color: RuhTheme.textTertiary,
                iconSize: IconSizes.md,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
              IconButton(
                icon: const Icon(LucideIcons.trash2, size: IconSizes.md),
                onPressed: onDelete,
                tooltip: 'Delete conversation',
                color: RuhTheme.textTertiary,
                iconSize: IconSizes.md,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
