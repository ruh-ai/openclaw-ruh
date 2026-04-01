import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/responsive.dart';
import '../../../config/theme.dart';
import '../../../providers/chat_provider.dart';
import '../../../services/workspace_service.dart';

/// Which workspace tab is active.
enum _WorkspaceTab { terminal, files, browser }

/// The main workspace panel container with Terminal, Files, and Browser tabs.
///
/// On desktop (width > 1000) this renders as a resizable right panel next to
/// the chat. On mobile it is displayed inside a [DraggableScrollableSheet].
class WorkspacePanel extends StatefulWidget {
  final String sandboxId;
  final List<ChatStep> steps;

  const WorkspacePanel({
    super.key,
    required this.sandboxId,
    required this.steps,
  });

  @override
  State<WorkspacePanel> createState() => _WorkspacePanelState();
}

class _WorkspacePanelState extends State<WorkspacePanel> {
  _WorkspaceTab _activeTab = _WorkspaceTab.terminal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? RuhTheme.darkCard : RuhTheme.cardColor,
        border: Border(left: BorderSide(color: theme.dividerColor)),
      ),
      child: Column(
        children: [
          // ── Tab bar ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: isDark ? RuhTheme.darkSurface : RuhTheme.footerBg,
              border: Border(bottom: BorderSide(color: theme.dividerColor)),
            ),
            child: Row(
              children: [
                _TabPill(
                  label: 'Terminal',
                  icon: LucideIcons.terminal,
                  isActive: _activeTab == _WorkspaceTab.terminal,
                  onTap: () =>
                      setState(() => _activeTab = _WorkspaceTab.terminal),
                ),
                const SizedBox(width: 4),
                _TabPill(
                  label: 'Files',
                  icon: LucideIcons.folderOpen,
                  isActive: _activeTab == _WorkspaceTab.files,
                  onTap: () => setState(() => _activeTab = _WorkspaceTab.files),
                ),
                const SizedBox(width: 4),
                _TabPill(
                  label: 'Browser',
                  icon: LucideIcons.globe,
                  isActive: _activeTab == _WorkspaceTab.browser,
                  onTap: () =>
                      setState(() => _activeTab = _WorkspaceTab.browser),
                ),
              ],
            ),
          ),

          // ── Tab content ──────────────────────────────────────────────
          Expanded(child: _buildTabContent()),
        ],
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_activeTab) {
      case _WorkspaceTab.terminal:
        return _TerminalTab(steps: widget.steps);
      case _WorkspaceTab.files:
        return _FilesTab(sandboxId: widget.sandboxId);
      case _WorkspaceTab.browser:
        return _BrowserTab(sandboxId: widget.sandboxId);
    }
  }
}

// ---------------------------------------------------------------------------
// Tab pill button
// ---------------------------------------------------------------------------

class _TabPill extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool isActive;
  final VoidCallback onTap;

  const _TabPill({
    required this.label,
    required this.icon,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isActive
              ? RuhTheme.primary.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
          border: Border.all(
            color: isActive
                ? RuhTheme.primary.withValues(alpha: 0.3)
                : Colors.transparent,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: IconSizes.sm,
              color: isActive
                  ? RuhTheme.primary
                  : (isDark
                        ? RuhTheme.darkTextSecondary
                        : RuhTheme.textTertiary),
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                color: isActive
                    ? RuhTheme.primary
                    : (isDark
                          ? RuhTheme.darkTextSecondary
                          : RuhTheme.textTertiary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Terminal tab — tool execution history
// ---------------------------------------------------------------------------

class _TerminalTab extends StatelessWidget {
  final List<ChatStep> steps;

  const _TerminalTab({required this.steps});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (steps.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.terminal,
              size: IconSizes.xxl,
              color: RuhTheme.textTertiary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              'No activity yet',
              style: theme.textTheme.bodySmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Tool executions will appear here',
              style: theme.textTheme.labelSmall?.copyWith(
                color: RuhTheme.textTertiary.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: steps.length,
      // Scroll to keep latest visible.
      reverse: false,
      itemBuilder: (context, index) {
        final step = steps[index];
        return _TerminalEntry(step: step);
      },
    );
  }
}

class _TerminalEntry extends StatefulWidget {
  final ChatStep step;

  const _TerminalEntry({required this.step});

  @override
  State<_TerminalEntry> createState() => _TerminalEntryState();
}

class _TerminalEntryState extends State<_TerminalEntry> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final step = widget.step;
    final isDone = step.status == 'done';

    // Status dot color
    final Color dotColor;
    if (isDone) {
      dotColor = RuhTheme.success;
    } else {
      dotColor = RuhTheme.warning;
    }

    // Elapsed label
    final String elapsedLabel;
    if (isDone && step.elapsedMs != null) {
      elapsedLabel = '${(step.elapsedMs! / 1000).toStringAsFixed(1)}s';
    } else if (!isDone) {
      elapsedLabel = 'running...';
    } else {
      elapsedLabel = 'done';
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
          onTap: step.detail != null
              ? () => setState(() => _expanded = !_expanded)
              : null,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: _expanded
                  ? (isDark
                        ? RuhTheme.darkSurface.withValues(alpha: 0.5)
                        : RuhTheme.footerBg)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // Status dot
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: dotColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Tool name
                    Expanded(
                      child: Text(
                        step.toolName ?? step.label,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? RuhTheme.darkTextPrimary
                              : RuhTheme.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),

                    // Elapsed time
                    Text(
                      elapsedLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10,
                        color: RuhTheme.textTertiary,
                        fontFamily: 'monospace',
                      ),
                    ),

                    // Expand chevron
                    if (step.detail != null) ...[
                      const SizedBox(width: 4),
                      Icon(
                        _expanded
                            ? LucideIcons.chevronUp
                            : LucideIcons.chevronDown,
                        size: IconSizes.xs,
                        color: RuhTheme.textTertiary,
                      ),
                    ],
                  ],
                ),

                // Expandable detail
                if (_expanded && step.detail != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 15, top: 4),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isDark
                            ? RuhTheme.darkBackground
                            : RuhTheme.userMessageBg,
                        borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
                      ),
                      child: SelectableText(
                        step.detail!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: isDark
                              ? RuhTheme.darkTextSecondary
                              : RuhTheme.textSecondary,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Files tab — sandbox file browser
// ---------------------------------------------------------------------------

class _FilesTab extends StatefulWidget {
  final String sandboxId;

  const _FilesTab({required this.sandboxId});

  @override
  State<_FilesTab> createState() => _FilesTabState();
}

class _FilesTabState extends State<_FilesTab> {
  final WorkspaceService _service = WorkspaceService();
  List<WorkspaceFileEntry>? _files;
  bool _loading = true;

  // File viewer state
  String? _viewingPath;
  String? _fileContent;
  bool _loadingFile = false;

  @override
  void initState() {
    super.initState();
    _loadFiles();
  }

  @override
  void didUpdateWidget(covariant _FilesTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sandboxId != widget.sandboxId) {
      _loadFiles();
    }
  }

  Future<void> _loadFiles() async {
    setState(() {
      _loading = true;
    });

    final files = await _service.listFiles(widget.sandboxId);
    if (!mounted) return;

    setState(() {
      _files = files;
      _loading = false;
    });
  }

  Future<void> _openFile(String path) async {
    setState(() {
      _viewingPath = path;
      _loadingFile = true;
    });

    final content = await _service.getFileContent(widget.sandboxId, path);
    if (!mounted) return;

    setState(() {
      _fileContent = content;
      _loadingFile = false;
    });
  }

  void _closeFile() {
    setState(() {
      _viewingPath = null;
      _fileContent = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    // File content viewer
    if (_viewingPath != null) {
      return _buildFileViewer(context);
    }

    // File list
    return _buildFileList(context);
  }

  Widget _buildFileList(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    final files = _files;
    if (files == null || files.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              LucideIcons.folderOpen,
              size: IconSizes.xxl,
              color: RuhTheme.textTertiary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              'No files found',
              style: theme.textTheme.bodySmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _loadFiles,
              icon: const Icon(LucideIcons.refreshCw, size: IconSizes.sm),
              label: const Text('Refresh'),
              style: TextButton.styleFrom(
                foregroundColor: RuhTheme.primary,
                textStyle: theme.textTheme.labelSmall,
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Refresh bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            children: [
              Text(
                '${files.length} files',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: RuhTheme.textTertiary,
                ),
              ),
              const Spacer(),
              GestureDetector(
                onTap: _loadFiles,
                child: const Icon(
                  LucideIcons.refreshCw,
                  size: IconSizes.sm,
                  color: RuhTheme.textTertiary,
                ),
              ),
            ],
          ),
        ),
        Divider(height: 1, color: theme.dividerColor),
        // File list
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 4),
            itemCount: files.length,
            itemBuilder: (context, index) {
              final file = files[index];
              final indent = file.depth;

              return InkWell(
                onTap: () => _openFile(file.path),
                child: Padding(
                  padding: EdgeInsets.only(
                    left: 8.0 + (indent * 12.0),
                    right: 8,
                    top: 4,
                    bottom: 4,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _fileIcon(file.name),
                        size: IconSizes.sm,
                        color: _fileIconColor(file.name),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          file.name,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontFamily: 'monospace',
                            color: isDark
                                ? RuhTheme.darkTextPrimary
                                : RuhTheme.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (file.size != null)
                        Text(
                          _formatSize(file.size!),
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontSize: 10,
                            color: RuhTheme.textTertiary,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildFileViewer(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final fileName = _viewingPath!.split('/').last;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header with back button
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: theme.dividerColor)),
          ),
          child: Row(
            children: [
              GestureDetector(
                onTap: _closeFile,
                child: const Icon(
                  LucideIcons.arrowLeft,
                  size: IconSizes.md,
                  color: RuhTheme.textTertiary,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  fileName,
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),

        // File content
        Expanded(
          child: _loadingFile
              ? const Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(8),
                  child: SelectableText(
                    _fileContent ?? '',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      height: 1.5,
                      color: isDark
                          ? RuhTheme.darkTextPrimary
                          : RuhTheme.textPrimary,
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  IconData _fileIcon(String name) {
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    switch (ext) {
      case 'md':
        return LucideIcons.fileText;
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return LucideIcons.fileCode;
      case 'json':
        return LucideIcons.braces;
      case 'yaml':
      case 'yml':
        return LucideIcons.settings;
      case 'dart':
        return LucideIcons.fileCode;
      case 'py':
        return LucideIcons.fileCode;
      case 'sh':
      case 'bash':
        return LucideIcons.terminal;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'svg':
      case 'gif':
        return LucideIcons.image;
      default:
        return LucideIcons.file;
    }
  }

  Color _fileIconColor(String name) {
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    switch (ext) {
      case 'ts':
      case 'tsx':
        return const Color(0xFF3178C6);
      case 'js':
      case 'jsx':
        return const Color(0xFFF7DF1E);
      case 'json':
        return RuhTheme.warning;
      case 'md':
        return RuhTheme.info;
      case 'dart':
        return const Color(0xFF0175C2);
      case 'py':
        return const Color(0xFF3776AB);
      default:
        return RuhTheme.textTertiary;
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '${bytes}B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)}K';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)}M';
  }
}

// ---------------------------------------------------------------------------
// Browser tab — preview URLs and placeholder
// ---------------------------------------------------------------------------

class _BrowserTab extends StatefulWidget {
  final String sandboxId;

  const _BrowserTab({required this.sandboxId});

  @override
  State<_BrowserTab> createState() => _BrowserTabState();
}

class _BrowserTabState extends State<_BrowserTab> {
  final WorkspaceService _service = WorkspaceService();
  List<PreviewPort> _ports = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPorts();
  }

  @override
  void didUpdateWidget(covariant _BrowserTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sandboxId != widget.sandboxId) {
      _loadPorts();
    }
  }

  Future<void> _loadPorts() async {
    setState(() => _loading = true);
    final ports = await _service.getPreviewPorts(widget.sandboxId);
    if (!mounted) return;
    setState(() {
      _ports = ports;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: _ports.isEmpty
            ? MainAxisAlignment.center
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (_ports.isEmpty) ...[
            Icon(
              LucideIcons.globe,
              size: IconSizes.xxl,
              color: RuhTheme.textTertiary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              'Browser preview available when\nagent uses browser tools',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: RuhTheme.textTertiary,
              ),
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _loadPorts,
              icon: const Icon(LucideIcons.refreshCw, size: IconSizes.sm),
              label: const Text('Check for ports'),
              style: TextButton.styleFrom(
                foregroundColor: RuhTheme.primary,
                textStyle: theme.textTheme.labelSmall,
              ),
            ),
          ] else ...[
            // Detected preview ports
            Row(
              children: [
                const Icon(
                  LucideIcons.radio,
                  size: IconSizes.sm,
                  color: RuhTheme.success,
                ),
                const SizedBox(width: 6),
                Text(
                  '${_ports.length} preview port${_ports.length == 1 ? '' : 's'} detected',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: _loadPorts,
                  child: const Icon(
                    LucideIcons.refreshCw,
                    size: IconSizes.sm,
                    color: RuhTheme.textTertiary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ..._ports.map((port) => _PreviewPortTile(port: port)),
          ],
        ],
      ),
    );
  }
}

class _PreviewPortTile extends StatelessWidget {
  final PreviewPort port;

  const _PreviewPortTile({required this.port});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
          onTap: () {
            // TODO: Open URL via url_launcher or in-app browser
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? RuhTheme.darkSurface : RuhTheme.footerBg,
              borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
              border: Border.all(color: theme.dividerColor),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: RuhTheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
                  ),
                  child: Text(
                    ':${port.port}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w600,
                      color: RuhTheme.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (port.label != null)
                        Text(
                          port.label!,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      Text(
                        port.url,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontSize: 10,
                          color: RuhTheme.info,
                          fontFamily: 'monospace',
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const Icon(
                  LucideIcons.externalLink,
                  size: IconSizes.sm,
                  color: RuhTheme.textTertiary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
