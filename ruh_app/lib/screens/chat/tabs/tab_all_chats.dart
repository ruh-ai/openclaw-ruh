import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../models/conversation.dart';
import '../../../providers/chat_provider.dart';

/// Conversation history tab showing a list of all chats for the active sandbox.
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
  List<Conversation>? _conversations;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  @override
  void didUpdateWidget(TabAllChats oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sandboxId != widget.sandboxId) {
      _loadConversations();
    }
  }

  Future<void> _loadConversations() async {
    if (widget.sandboxId == null) {
      setState(() {
        _loading = false;
        _conversations = [];
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final convService = ref.read(conversationServiceProvider);
      final convs =
          await convService.listConversations(widget.sandboxId!, limit: 50);
      if (mounted) {
        setState(() {
          _conversations = convs;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _createNewChat() async {
    if (widget.sandboxId == null) return;

    try {
      final convService = ref.read(conversationServiceProvider);
      await convService.createConversation(widget.sandboxId!);
      await _loadConversations();
      // Switch to the Chat tab with the new conversation
      widget.onOpenConversation('');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create conversation: $e')),
        );
      }
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
        await _loadConversations();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete: $e')),
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
          decoration: const InputDecoration(
            hintText: 'Conversation name',
          ),
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
            widget.sandboxId!, conv.id, newName);
        await _loadConversations();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to rename: $e')),
          );
        }
      }
    }
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
                gradient: RuhTheme.brandGradient,
                borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
              ),
              child: MaterialButton(
                onPressed: _createNewChat,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(LucideIcons.plus, size: 16, color: Colors.white),
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
          child: _buildContent(theme),
        ),
      ],
    );
  }

  Widget _buildContent(ThemeData theme) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.alertCircle, size: 32, color: RuhTheme.error),
            const SizedBox(height: 12),
            Text(
              'Failed to load conversations',
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            Text(
              _error!,
              style:
                  const TextStyle(fontSize: 12, color: RuhTheme.textTertiary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: _loadConversations,
              icon: const Icon(LucideIcons.refreshCw, size: 14),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    final convs = _conversations ?? [];
    if (convs.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.messageSquare,
                size: 40, color: RuhTheme.textTertiary),
            const SizedBox(height: 12),
            Text('No conversations yet', style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              'Start a new chat to begin.',
              style:
                  const TextStyle(fontSize: 13, color: RuhTheme.textSecondary),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: convs.length,
      itemBuilder: (context, index) {
        final conv = convs[index];
        return _ConversationTile(
          conversation: conv,
          onOpen: () => widget.onOpenConversation(conv.id),
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
    return '${dt.month}/${dt.day}/${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(LucideIcons.messageSquare,
                  size: 18, color: RuhTheme.primary),
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
              // Rename
              IconButton(
                icon: const Icon(LucideIcons.edit3, size: 16),
                onPressed: onRename,
                tooltip: 'Rename',
                color: RuhTheme.textTertiary,
                iconSize: 16,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
              // Delete
              IconButton(
                icon: const Icon(LucideIcons.trash2, size: 16),
                onPressed: onDelete,
                tooltip: 'Delete',
                color: RuhTheme.textTertiary,
                iconSize: 16,
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
