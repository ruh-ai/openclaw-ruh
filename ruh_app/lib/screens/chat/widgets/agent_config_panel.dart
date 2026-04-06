import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../models/agent.dart';
import '../../../models/customer_agent_config.dart';
import '../../../providers/agent_provider.dart';
import '../../../utils/error_formatter.dart';

class AgentConfigPanel extends ConsumerStatefulWidget {
  final String agentId;
  final String sandboxId;

  const AgentConfigPanel({
    super.key,
    required this.agentId,
    required this.sandboxId,
  });

  @override
  ConsumerState<AgentConfigPanel> createState() => _AgentConfigPanelState();
}

class _AgentConfigPanelState extends ConsumerState<AgentConfigPanel> {
  CustomerAgentConfig? _config;
  bool _isLoading = true;
  bool _isSaving = false;
  String? _error;

  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _rulesController;
  late final TextEditingController _memoryInstructionsController;
  late final TextEditingController _memorySummaryController;
  late final TextEditingController _memoryPinnedPathsController;
  final Map<String, TextEditingController> _runtimeInputControllers = {};

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _descriptionController = TextEditingController();
    _rulesController = TextEditingController();
    _memoryInstructionsController = TextEditingController();
    _memorySummaryController = TextEditingController();
    _memoryPinnedPathsController = TextEditingController();
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _rulesController.dispose();
    _memoryInstructionsController.dispose();
    _memorySummaryController.dispose();
    _memoryPinnedPathsController.dispose();
    for (final controller in _runtimeInputControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final config = await ref
          .read(agentServiceProvider)
          .getCustomerConfig(widget.agentId);
      if (!mounted) return;
      _applyConfig(config);
      setState(() {
        _config = config;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = formatError(e);
        _isLoading = false;
      });
    }
  }

  void _applyConfig(CustomerAgentConfig config) {
    _nameController.text = config.agent.name;
    _descriptionController.text = config.agent.description;
    _rulesController.text = config.agentRules.join('\n');
    _memoryInstructionsController.text = config.workspaceMemory.instructions;
    _memorySummaryController.text = config.workspaceMemory.continuitySummary;
    _memoryPinnedPathsController.text = config.workspaceMemory.pinnedPaths.join(
      '\n',
    );

    final validKeys = config.runtimeInputs.map((input) => input.key).toSet();
    final staleKeys = _runtimeInputControllers.keys
        .where((key) => !validKeys.contains(key))
        .toList();
    for (final key in staleKeys) {
      _runtimeInputControllers.remove(key)?.dispose();
    }

    for (final input in config.runtimeInputs) {
      final controller = _runtimeInputControllers.putIfAbsent(
        input.key,
        TextEditingController.new,
      );
      controller.text = input.value;
    }
  }

  Future<void> _save() async {
    final current = _config;
    if (current == null || _isSaving) {
      return;
    }

    setState(() {
      _isSaving = true;
      _error = null;
    });

    try {
      await ref.read(agentServiceProvider).updateCustomerConfig(
            widget.agentId,
            name: _nameController.text.trim(),
            description: _descriptionController.text.trim(),
            agentRules: _parseLines(_rulesController.text),
            runtimeInputValues: current.runtimeInputs
                .map(
                  (input) => RuntimeInputValueUpdate(
                    key: input.key,
                    value: _runtimeInputControllers[input.key]?.text.trim() ?? '',
                  ),
                )
                .toList(),
          );
      await ref.read(agentServiceProvider).updateWorkspaceMemory(
            widget.agentId,
            WorkspaceMemory(
              instructions: _memoryInstructionsController.text.trim(),
              continuitySummary: _memorySummaryController.text.trim(),
              pinnedPaths: _parseLines(_memoryPinnedPathsController.text),
            ),
          );

      final refreshed = await ref
          .read(agentServiceProvider)
          .getCustomerConfig(widget.agentId);
      if (!mounted) return;

      _applyConfig(refreshed);
      _synchronizeSelectedAgent(refreshed);
      setState(() {
        _config = refreshed;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Agent configuration saved')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = formatError(e);
      });
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _synchronizeSelectedAgent(CustomerAgentConfig config) {
    final selected = ref.read(selectedAgentProvider);
    if (selected == null || selected.id != config.agent.id) {
      return;
    }

    ref.read(selectedAgentProvider.notifier).state = Agent(
      id: selected.id,
      name: config.agent.name,
      avatar: config.agent.avatar,
      description: config.agent.description,
      skills: config.skills,
      triggerLabel: selected.triggerLabel,
      status: config.agent.status,
      sandboxIds: config.agent.sandboxIds,
      forgeSandboxId: selected.forgeSandboxId,
      skillGraph: selected.skillGraph,
      agentRules: config.agentRules,
      runtimeInputs: config.runtimeInputs,
      toolConnections: config.toolConnections,
      triggers: config.triggers,
      channels: config.channels,
      workspaceMemory: WorkspaceMemory(
        instructions: config.workspaceMemory.instructions,
        continuitySummary: config.workspaceMemory.continuitySummary,
        pinnedPaths: config.workspaceMemory.pinnedPaths,
        updatedAt: config.workspaceMemory.updatedAt,
      ),
      createdAt: selected.createdAt,
      updatedAt: config.agent.updatedAt,
    );
  }

  List<String> _parseLines(String raw) {
    return raw
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _config == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                LucideIcons.alertCircle,
                color: RuhTheme.error,
                size: 36,
              ),
              const SizedBox(height: 12),
              Text(
                'Could not load configuration',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: RuhTheme.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(LucideIcons.refreshCw, size: 16),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final config = _config!;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Agent configuration',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'View the setup created for this agent and update the safe runtime fields here.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: RuhTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              onPressed: _isLoading || _isSaving ? null : _load,
              icon: const Icon(LucideIcons.refreshCw, size: 16),
              label: const Text('Refresh'),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: RuhTheme.error.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: RuhTheme.error.withValues(alpha: 0.16),
              ),
            ),
            child: Text(
              _error!,
              style: theme.textTheme.bodySmall?.copyWith(color: RuhTheme.error),
            ),
          ),
        ],
        const SizedBox(height: 16),
        _SectionCard(
          title: 'Runtime summary',
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _SummaryPill(label: 'Status', value: config.agent.status),
              _SummaryPill(label: 'Sandbox', value: widget.sandboxId),
              _SummaryPill(
                label: 'Updated',
                value: _formatDate(config.agent.updatedAt),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Identity',
          child: Column(
            children: [
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Agent name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _descriptionController,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Agent rules',
          subtitle: 'One rule per line',
          child: TextField(
            controller: _rulesController,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(
              labelText: 'Rules',
              alignLabelWithHint: true,
            ),
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Runtime inputs',
          subtitle: 'Update the operator-provided values without changing their schema.',
          child: Column(
            children: config.runtimeInputs.map((input) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _runtimeInputControllers[input.key],
                  decoration: InputDecoration(
                    labelText: input.label.isNotEmpty ? input.label : input.key,
                    helperText: input.description.isNotEmpty
                        ? input.description
                        : null,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Workspace memory',
          subtitle: 'Durable context reused across new conversations.',
          child: Column(
            children: [
              TextField(
                controller: _memoryInstructionsController,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(
                  labelText: 'Instructions',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _memorySummaryController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Continuity summary',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _memoryPinnedPathsController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Pinned paths',
                  helperText: 'One safe relative workspace path per line',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Skills',
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: config.skills.isEmpty
                ? const [_EmptyLabel(label: 'No skills recorded')]
                : config.skills.map((skill) => Chip(label: Text(skill))).toList(),
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Connected tools',
          child: _KeyValueList(
            items: config.toolConnections
                .map(
                  (tool) => (
                    title: tool.name.isNotEmpty ? tool.name : tool.toolId,
                    subtitle: tool.description,
                    meta: tool.status,
                  ),
                )
                .toList(),
            emptyLabel: 'No tools connected',
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Triggers',
          child: _KeyValueList(
            items: config.triggers
                .map(
                  (trigger) => (
                    title: trigger.title.isNotEmpty ? trigger.title : trigger.id,
                    subtitle: trigger.description,
                    meta: trigger.kind,
                  ),
                )
                .toList(),
            emptyLabel: 'No triggers configured',
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Channels',
          child: _KeyValueList(
            items: config.channels
                .map(
                  (channel) => (
                    title: channel.label.isNotEmpty ? channel.label : channel.kind,
                    subtitle: channel.description,
                    meta: channel.status,
                  ),
                )
                .toList(),
            emptyLabel: 'No channels configured',
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Creation snapshot',
          subtitle: 'Read-only context captured during the original setup flow.',
          child: config.creationSession == null
              ? const _EmptyLabel(label: 'No creation snapshot recorded')
              : Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: RuhTheme.lightPurple,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: SelectableText(
                    const JsonEncoder.withIndent(
                      '  ',
                    ).convert(config.creationSession),
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                      height: 1.5,
                    ),
                  ),
                ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isSaving ? null : _save,
            icon: _isSaving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(LucideIcons.save, size: 16),
            label: Text(_isSaving ? 'Saving changes...' : 'Save changes'),
          ),
        ),
      ],
    );
  }

  String _formatDate(DateTime value) {
    final local = value.toLocal();
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;

  const _SectionCard({
    required this.title,
    this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: RuhTheme.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _SummaryPill extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryPill({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: RuhTheme.lightPurple,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: RuhTheme.textTertiary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyLabel extends StatelessWidget {
  final String label;

  const _EmptyLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(
        context,
      ).textTheme.bodySmall?.copyWith(color: RuhTheme.textSecondary),
    );
  }
}

class _KeyValueList extends StatelessWidget {
  final List<({String title, String subtitle, String meta})> items;
  final String emptyLabel;

  const _KeyValueList({required this.items, required this.emptyLabel});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (items.isEmpty) {
      return _EmptyLabel(label: emptyLabel);
    }

    return Column(
      children: items.map((item) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (item.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        item.subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: RuhTheme.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                item.meta,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: RuhTheme.textTertiary,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
