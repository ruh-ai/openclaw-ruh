import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../services/api_client.dart';

/// Code viewer panel showing file content with basic syntax coloring.
class CodePanel extends StatefulWidget {
  final String sandboxId;
  final String? filePath;

  const CodePanel({super.key, required this.sandboxId, this.filePath});

  @override
  State<CodePanel> createState() => _CodePanelState();
}

class _CodePanelState extends State<CodePanel> {
  String? _content;
  String? _language;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.filePath != null) _loadFile(widget.filePath!);
  }

  @override
  void didUpdateWidget(CodePanel old) {
    super.didUpdateWidget(old);
    if (old.filePath != widget.filePath && widget.filePath != null) {
      _loadFile(widget.filePath!);
    }
  }

  Future<void> _loadFile(String path) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final client = ApiClient();
      final response = await client.get<Map<String, dynamic>>(
        '/api/sandboxes/${widget.sandboxId}/workspace/file',
        queryParameters: {'path': path},
      );
      if (!mounted) return;
      final data = response.data;
      setState(() {
        _content = data?['content'] as String? ?? '';
        _language = _detectLanguage(path);
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not load file';
          _loading = false;
        });
      }
    }
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
    return Column(
      children: [
        // Header with file path
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: Color(0xFF1E1E2E),
            border: Border(bottom: BorderSide(color: Color(0xFF333344))),
          ),
          child: Row(
            children: [
              const Icon(
                LucideIcons.fileCode,
                size: 14,
                color: Color(0xFF9CA3AF),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.filePath ?? 'No file selected',
                  style: const TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: Color(0xFF9CA3AF),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
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

        // Content
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
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xFF9CA3AF),
                        fontSize: 12,
                      ),
                    ),
                  )
                : _content == null
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          LucideIcons.fileCode,
                          size: 32,
                          color: Color(0xFF4B5563),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'File content appears here when\nthe agent reads or writes files.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xFF6B7280),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _content!.split('\n').length,
                    itemBuilder: (context, index) {
                      final lines = _content!.split('\n');
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
                  ),
          ),
        ),
      ],
    );
  }
}
