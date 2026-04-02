import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../services/workspace_service.dart';

/// File browser and code viewer for the sandbox workspace.
class CodePanel extends StatefulWidget {
  final String sandboxId;
  final String? filePath;
  final WorkspaceService? service;

  const CodePanel({
    super.key,
    required this.sandboxId,
    this.filePath,
    this.service,
  });

  @override
  State<CodePanel> createState() => _CodePanelState();
}

class _CodePanelState extends State<CodePanel> {
  late final WorkspaceService _workspaceService;
  List<WorkspaceFileEntry> _files = const [];
  String? _content;
  String? _language;
  String? _selectedPath;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _workspaceService = widget.service ?? WorkspaceService();
    _loadFiles(initialSelection: widget.filePath);
  }

  @override
  void didUpdateWidget(CodePanel old) {
    super.didUpdateWidget(old);
    if (old.sandboxId != widget.sandboxId) {
      _loadFiles(initialSelection: widget.filePath);
      return;
    }
    if (old.filePath != widget.filePath && widget.filePath != null) {
      _openFile(widget.filePath!);
    }
  }

  Future<void> _loadFiles({String? initialSelection}) async {
    setState(() {
      _loading = true;
      _error = null;
      _files = const [];
      _selectedPath = initialSelection;
      _content = null;
      _language = initialSelection != null
          ? _detectLanguage(initialSelection)
          : null;
    });

    try {
      final files = await _workspaceService.listFiles(widget.sandboxId);
      if (!mounted) return;

      setState(() {
        _files = files;
        _loading = false;
      });

      if (initialSelection != null) {
        await _openFile(initialSelection);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load workspace files';
      });
    }
  }

  Future<void> _openFile(String path) async {
    setState(() {
      _loading = true;
      _error = null;
      _selectedPath = path;
      _language = _detectLanguage(path);
    });

    try {
      final content = await _workspaceService.getFileContent(
        widget.sandboxId,
        path,
      );
      if (!mounted) return;

      setState(() {
        _content = content;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load file';
        _loading = false;
      });
    }
  }

  Future<void> _refresh() async {
    await _loadFiles(initialSelection: _selectedPath ?? widget.filePath);
  }

  void _showFileList() {
    setState(() {
      _selectedPath = null;
      _content = null;
      _language = null;
      _error = null;
    });
  }

  String _detectLanguage(String path) {
    if (path.endsWith('.dart')) return 'dart';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
    return 'text';
  }

  @override
  Widget build(BuildContext context) {
    final headerTitle = _selectedPath ?? 'Workspace files';

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0xFF1E1E2E),
            border: Border(bottom: BorderSide(color: Color(0xFF333344))),
          ),
          child: Row(
            children: [
              const Icon(
                LucideIcons.folderOpen,
                size: 14,
                color: Color(0xFF9CA3AF),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  headerTitle,
                  style: const TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: Color(0xFF9CA3AF),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (_selectedPath != null)
                IconButton(
                  icon: const Icon(
                    LucideIcons.folderOpen,
                    size: 14,
                    color: Color(0xFF9CA3AF),
                  ),
                  onPressed: _showFileList,
                  tooltip: 'Show workspace files',
                  iconSize: 14,
                  constraints: const BoxConstraints(
                    minWidth: 28,
                    minHeight: 28,
                  ),
                  padding: EdgeInsets.zero,
                ),
              IconButton(
                icon: const Icon(
                  LucideIcons.refreshCw,
                  size: 14,
                  color: Color(0xFF9CA3AF),
                ),
                onPressed: _loading ? null : _refresh,
                tooltip: 'Refresh workspace files',
                iconSize: 14,
                constraints: const BoxConstraints(
                  minWidth: 28,
                  minHeight: 28,
                ),
                padding: EdgeInsets.zero,
              ),
              if (_language != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF333344),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    _language!,
                    style: const TextStyle(
                      fontSize: 10,
                      color: Color(0xFF9CA3AF),
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: Container(
            color: const Color(0xFF1E1E2E),
            child: _loading
                ? const Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Color(0xFF9CA3AF),
                      ),
                    ),
                  )
                : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          style: const TextStyle(
                            color: Color(0xFF9CA3AF),
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: _refresh,
                          icon: const Icon(
                            LucideIcons.refreshCw,
                            size: 14,
                          ),
                          label: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : _content == null
                ? _buildFileList()
                : _buildFileViewer(),
          ),
        ),
      ],
    );
  }

  Widget _buildFileList() {
    if (_files.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              LucideIcons.folderOpen,
              size: 32,
              color: Color(0xFF4B5563),
            ),
            const SizedBox(height: 8),
            const Text(
              'No workspace files available yet.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF6B7280), fontSize: 12),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _refresh,
              icon: const Icon(LucideIcons.refreshCw, size: 14),
              label: const Text('Refresh'),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _files.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, color: Color(0xFF333344)),
      itemBuilder: (context, index) {
        final file = _files[index];
        return ListTile(
          dense: true,
          contentPadding: EdgeInsets.only(
            left: 8 + (file.depth * 12),
            right: 8,
          ),
          leading: const Icon(
            LucideIcons.fileCode,
            size: 16,
            color: Color(0xFF9CA3AF),
          ),
          title: Text(
            file.name,
            style: const TextStyle(
              fontSize: 12,
              fontFamily: 'monospace',
              color: Color(0xFFD4D4D8),
            ),
          ),
          subtitle: Text(
            file.path,
            style: const TextStyle(
              fontSize: 10,
              fontFamily: 'monospace',
              color: Color(0xFF6B7280),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: file.size != null
              ? Text(
                  '${file.size} B',
                  style: const TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: Color(0xFF6B7280),
                  ),
                )
              : null,
          onTap: () => _openFile(file.path),
        );
      },
    );
  }

  Widget _buildFileViewer() {
    final lines = _content!.split('\n');
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: lines.length,
      itemBuilder: (context, index) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 40,
              child: Text(
                '${index + 1}',
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: Color(0xFF4B5563),
                ),
                textAlign: TextAlign.right,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                lines[index],
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: Color(0xFFD4D4D8),
                  height: 1.5,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
