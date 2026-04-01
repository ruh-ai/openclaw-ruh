import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';
import '../../../services/api_client.dart';

/// File tree browser for the agent's workspace.
class FilesPanel extends StatefulWidget {
  final String sandboxId;

  const FilesPanel({super.key, required this.sandboxId});

  @override
  State<FilesPanel> createState() => _FilesPanelState();
}

class _FilesPanelState extends State<FilesPanel> {
  List<WorkspaceFile>? _files;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadFiles();
  }

  @override
  void didUpdateWidget(FilesPanel old) {
    super.didUpdateWidget(old);
    if (old.sandboxId != widget.sandboxId) _loadFiles();
  }

  Future<void> _loadFiles() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final client = ApiClient();
      final response = await client.get<Map<String, dynamic>>(
        '/api/sandboxes/${widget.sandboxId}/workspace/files',
      );
      if (!mounted) return;
      final data = response.data;
      if (data != null && data['files'] is List) {
        setState(() {
          _files = (data['files'] as List)
              .map((e) => WorkspaceFile.fromJson(e as Map<String, dynamic>))
              .toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not load files';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: RuhTheme.borderMuted)),
          ),
          child: Row(
            children: [
              const Icon(
                LucideIcons.folderTree,
                size: 14,
                color: RuhTheme.textTertiary,
              ),
              const SizedBox(width: 6),
              const Text(
                'Workspace Files',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: RuhTheme.textSecondary,
                ),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(LucideIcons.refreshCw, size: 14),
                onPressed: _loadFiles,
                tooltip: 'Refresh files',
                iconSize: 14,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                padding: EdgeInsets.zero,
                color: RuhTheme.textTertiary,
              ),
            ],
          ),
        ),

        // Content
        Expanded(
          child: _loading
              ? const Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        LucideIcons.folderX,
                        size: 24,
                        color: RuhTheme.textTertiary,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: RuhTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: _loadFiles,
                        child: const Text(
                          'Retry',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                )
              : _files == null || _files!.isEmpty
              ? const Center(
                  child: Text(
                    'No files in workspace',
                    style: TextStyle(
                      color: RuhTheme.textTertiary,
                      fontSize: 13,
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(8),
                  children: _files!
                      .map((f) => _FileTreeNode(file: f, depth: 0))
                      .toList(),
                ),
        ),
      ],
    );
  }
}

class _FileTreeNode extends StatefulWidget {
  final WorkspaceFile file;
  final int depth;

  const _FileTreeNode({required this.file, required this.depth});

  @override
  State<_FileTreeNode> createState() => _FileTreeNodeState();
}

class _FileTreeNodeState extends State<_FileTreeNode> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final file = widget.file;
    final indent = widget.depth * 16.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: file.isDirectory
              ? () => setState(() => _expanded = !_expanded)
              : null,
          child: Padding(
            padding: EdgeInsets.only(
              left: indent + 8,
              top: 4,
              bottom: 4,
              right: 8,
            ),
            child: Row(
              children: [
                Icon(
                  file.isDirectory
                      ? (_expanded
                            ? LucideIcons.folderOpen
                            : LucideIcons.folder)
                      : _fileIcon(file.name),
                  size: 14,
                  color: file.isDirectory
                      ? RuhTheme.warning
                      : RuhTheme.textTertiary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    file.name,
                    style: TextStyle(
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: file.isDirectory
                          ? RuhTheme.textPrimary
                          : RuhTheme.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (file.size != null)
                  Text(
                    _formatSize(file.size!),
                    style: const TextStyle(
                      fontSize: 10,
                      color: RuhTheme.textTertiary,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_expanded && file.isDirectory)
          ...file.children.map(
            (c) => _FileTreeNode(file: c, depth: widget.depth + 1),
          ),
      ],
    );
  }

  IconData _fileIcon(String name) {
    if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      return LucideIcons.fileCode;
    }
    if (name.endsWith('.js') || name.endsWith('.jsx')) {
      return LucideIcons.fileCode;
    }
    if (name.endsWith('.py')) return LucideIcons.fileCode;
    if (name.endsWith('.md')) return LucideIcons.fileText;
    if (name.endsWith('.json')) return LucideIcons.braces;
    if (name.endsWith('.dart')) return LucideIcons.fileCode;
    return LucideIcons.file;
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1048576) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / 1048576).toStringAsFixed(1)} MB';
  }
}
