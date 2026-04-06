import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../models/agent.dart';
import '../../providers/agent_provider.dart';
import '../../providers/sandbox_health_provider.dart';
import '../../utils/error_formatter.dart';
import '../../widgets/alive_animations.dart';

/// Agent detail view shown when tapping an agent card from the list.
///
/// Displays full agent info: description, skills, tools, triggers,
/// deployments, and action buttons (Chat, Restart).
class AgentDetailScreen extends ConsumerStatefulWidget {
  final String agentId;

  const AgentDetailScreen({super.key, required this.agentId});

  @override
  ConsumerState<AgentDetailScreen> createState() => _AgentDetailScreenState();
}

class _AgentDetailScreenState extends ConsumerState<AgentDetailScreen> {
  Agent? _agent;
  bool _isLoading = true;
  String? _error;
  bool _isRestarting = false;
  bool _isLaunching = false;

  @override
  void initState() {
    super.initState();
    _fetchAgent();
  }

  Future<void> _fetchAgent() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final service = ref.read(agentServiceProvider);
      final agent = await service.getAgent(widget.agentId);
      if (mounted) {
        setState(() {
          _agent = agent;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = formatError(e);
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _restartSandbox(String sandboxId) async {
    setState(() => _isRestarting = true);
    try {
      final service = ref.read(agentServiceProvider);
      await service.restartSandbox(sandboxId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sandbox restart initiated')),
        );
        // Invalidate health so it re-fetches
        ref.invalidate(sandboxHealthProvider(sandboxId));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Restart failed: ${formatError(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _isRestarting = false);
    }
  }

  Future<void> _navigateToChat() async {
    final agent = _agent;
    if (agent == null || _isLaunching) return;

    // Gate: check for missing required inputs before launching
    if (agent.hasMissingRequiredInputs) {
      context.push('/agents/${agent.id}/setup', extra: agent);
      return;
    }

    setState(() => _isLaunching = true);
    try {
      final launchableAgent = await ref
          .read(agentServiceProvider)
          .launchAgent(agent.id);
      if (!mounted) return;

      setState(() {
        _agent = launchableAgent;
      });
      ref.read(selectedAgentProvider.notifier).state = launchableAgent;
      ref
          .read(activeSandboxIdProvider.notifier)
          .state = launchableAgent.sandboxIds.isNotEmpty
          ? launchableAgent.sandboxIds.first
          : null;
      context.push('/chat/${launchableAgent.id}');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not launch agent: ${formatError(e)}')),
      );
    } finally {
      if (mounted) {
        setState(() => _isLaunching = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.canPop() ? context.pop() : context.go('/'),
          ),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null || _agent == null) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(LucideIcons.arrowLeft),
            onPressed: () => context.canPop() ? context.pop() : context.go('/'),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                LucideIcons.alertCircle,
                size: 40,
                color: RuhTheme.error,
              ),
              const SizedBox(height: 16),
              Text('Agent not found', style: theme.textTheme.titleMedium),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: RuhTheme.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: _fetchAgent,
                icon: const Icon(LucideIcons.refreshCw, size: IconSizes.sm),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    final agent = _agent!;
    final isActive = agent.isActive;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
        title: Text(agent.name),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // -- Header: avatar + name + status --
          _AgentHeader(agent: agent),
          const SizedBox(height: 20),

          _AgentOverviewCard(agent: agent),
          const SizedBox(height: 20),

          // -- Primary actions --
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RuhTheme.brandGradient,
                      borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
                    ),
                    child: MaterialButton(
                      onPressed: _isLaunching ? null : _navigateToChat,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(RuhTheme.radiusLg),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _isLaunching
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      Colors.white,
                                    ),
                                  ),
                                )
                              : const Icon(
                                  LucideIcons.messageSquare,
                                  size: IconSizes.md,
                                  color: Colors.white,
                                ),
                          const SizedBox(width: 8),
                          Text(
                            _isLaunching ? 'Preparing runtime...' : 'Open chat',
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
              if (agent.sandboxIds.isNotEmpty && !isActive) ...[
                const SizedBox(width: 12),
                SizedBox(
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: _isRestarting
                        ? null
                        : () => _restartSandbox(agent.sandboxIds.first),
                    icon: _isRestarting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(LucideIcons.refreshCw, size: IconSizes.md),
                    label: Text(_isRestarting ? 'Restarting...' : 'Restart'),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 28),

          // -- Description --
          if (agent.description.isNotEmpty) ...[
            _SectionTitle(title: 'About this agent'),
            const SizedBox(height: 8),
            Text(
              agent.description,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: RuhTheme.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
          ],

          _SectionTitle(title: 'Configuration details'),
          const SizedBox(height: 12),

          // -- Skills --
          _SectionTitle(title: 'Skills', count: agent.skills.length),
          const SizedBox(height: 8),
          agent.skills.isEmpty
              ? _EmptyHint(text: 'No skills configured')
              : Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: agent.skills
                      .map(
                        (skill) => Chip(
                          avatar: const Icon(LucideIcons.zap, size: 14),
                          label: Text(skill),
                        ),
                      )
                      .toList(),
                ),
          const SizedBox(height: 24),

          // -- Tools --
          _SectionTitle(title: 'Tools', count: agent.toolConnections.length),
          const SizedBox(height: 8),
          agent.toolConnections.isEmpty
              ? _EmptyHint(text: 'No tools connected')
              : Column(
                  children: agent.toolConnections
                      .map((tool) => _ToolTile(tool: tool))
                      .toList(),
                ),
          const SizedBox(height: 24),

          // -- Triggers --
          _SectionTitle(title: 'Triggers', count: agent.triggers.length),
          const SizedBox(height: 8),
          agent.triggers.isEmpty
              ? _EmptyHint(text: 'No triggers configured')
              : Column(
                  children: agent.triggers
                      .map((trigger) => _TriggerTile(trigger: trigger))
                      .toList(),
                ),
          const SizedBox(height: 24),

          // -- Deployments --
          _SectionTitle(title: 'Deployments', count: agent.sandboxIds.length),
          const SizedBox(height: 8),
          agent.sandboxIds.isEmpty
              ? _EmptyHint(text: 'No sandboxes deployed')
              : Column(
                  children: agent.sandboxIds
                      .map(
                        (id) => _DeploymentTile(
                          sandboxId: id,
                          onRestart: () => _restartSandbox(id),
                          isRestarting: _isRestarting,
                        ),
                      )
                      .toList(),
                ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _AgentOverviewCard extends StatelessWidget {
  final Agent agent;

  const _AgentOverviewCard({required this.agent});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isActive = agent.isActive;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: RuhTheme.borderDefault),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: isActive
                  ? RuhTheme.success.withValues(alpha: 0.1)
                  : RuhTheme.accentLight,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              isActive ? 'Live and ready' : 'Launch on first open',
              style: theme.textTheme.labelSmall?.copyWith(
                color: isActive ? RuhTheme.success : RuhTheme.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Open ${agent.name} when you need focused help.',
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            agent.description.isNotEmpty
                ? agent.description
                : 'This digital employee is available from your workspace and can be launched into chat whenever you are ready.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: RuhTheme.textSecondary,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Agent header (avatar + name + status badge)
// ---------------------------------------------------------------------------

class _AgentHeader extends StatelessWidget {
  final Agent agent;

  const _AgentHeader({required this.agent});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isActive = agent.isActive;

    return Row(
      children: [
        SoulPulse(
          intensity: isActive ? 0.7 : 0.2,
          enabled: isActive,
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: RuhTheme.accentLight,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Text(agent.avatar, style: const TextStyle(fontSize: 32)),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                agent.name,
                style: theme.textTheme.headlineMedium,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: isActive
                      ? RuhTheme.success.withValues(alpha: 0.1)
                      : RuhTheme.textTertiary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: isActive
                            ? RuhTheme.success
                            : RuhTheme.textTertiary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      agent.status.toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isActive
                            ? RuhTheme.success
                            : RuhTheme.textTertiary,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------

class _SectionTitle extends StatelessWidget {
  final String title;
  final int? count;

  const _SectionTitle({required this.title, this.count});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        if (count != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: RuhTheme.accentLight,
              borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: RuhTheme.primary,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Empty hint
// ---------------------------------------------------------------------------

class _EmptyHint extends StatelessWidget {
  final String text;

  const _EmptyHint({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          color: RuhTheme.textTertiary,
          fontStyle: FontStyle.italic,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tool tile
// ---------------------------------------------------------------------------

class _ToolTile extends StatelessWidget {
  final AgentToolConnection tool;

  const _ToolTile({required this.tool});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isConfigured =
        tool.status == 'configured' || tool.status == 'available';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              LucideIcons.wrench,
              size: IconSizes.md,
              color: isConfigured ? RuhTheme.primary : RuhTheme.textTertiary,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tool.name.isNotEmpty ? tool.name : tool.toolId,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (tool.description.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      tool.description,
                      style: const TextStyle(
                        fontSize: 12,
                        color: RuhTheme.textTertiary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: isConfigured
                    ? RuhTheme.success.withValues(alpha: 0.1)
                    : RuhTheme.warning.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
              ),
              child: Text(
                isConfigured ? 'Configured' : 'Missing',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: isConfigured ? RuhTheme.success : RuhTheme.warning,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Trigger tile
// ---------------------------------------------------------------------------

class _TriggerTile extends StatelessWidget {
  final AgentTrigger trigger;

  const _TriggerTile({required this.trigger});

  IconData _iconForKind(String kind) {
    switch (kind) {
      case 'schedule':
        return LucideIcons.clock;
      case 'webhook':
        return LucideIcons.webhook;
      case 'manual':
      default:
        return LucideIcons.hand;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              _iconForKind(trigger.kind),
              size: IconSizes.md,
              color: RuhTheme.secondary,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    trigger.title.isNotEmpty ? trigger.title : trigger.kind,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (trigger.schedule != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      trigger.schedule!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: RuhTheme.textTertiary,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                  if (trigger.description.isNotEmpty &&
                      trigger.schedule == null) ...[
                    const SizedBox(height: 2),
                    Text(
                      trigger.description,
                      style: const TextStyle(
                        fontSize: 12,
                        color: RuhTheme.textTertiary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            Chip(
              label: Text(trigger.kind),
              padding: EdgeInsets.zero,
              labelPadding: const EdgeInsets.symmetric(horizontal: 4),
              labelStyle: const TextStyle(fontSize: 10),
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Deployment tile (with health dot)
// ---------------------------------------------------------------------------

class _DeploymentTile extends ConsumerWidget {
  final String sandboxId;
  final VoidCallback onRestart;
  final bool isRestarting;

  const _DeploymentTile({
    required this.sandboxId,
    required this.onRestart,
    required this.isRestarting,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final healthAsync = ref.watch(sandboxHealthProvider(sandboxId));
    final health = healthAsync.valueOrNull;

    final Color healthColor;
    final String healthLabel;
    if (health == null) {
      healthColor = RuhTheme.textTertiary;
      healthLabel = 'Unknown';
    } else if (health.isHealthy) {
      healthColor = RuhTheme.success;
      healthLabel = 'Healthy';
    } else if (health.isRunning) {
      healthColor = RuhTheme.warning;
      healthLabel = 'Running (gateway unhealthy)';
    } else {
      healthColor = RuhTheme.error;
      healthLabel = 'Unreachable';
    }

    final shortId = sandboxId.length >= 12
        ? sandboxId.substring(0, 12)
        : sandboxId;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: healthColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    shortId,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    healthLabel,
                    style: TextStyle(fontSize: 12, color: healthColor),
                  ),
                ],
              ),
            ),
            if (health != null && !health.isHealthy)
              IconButton(
                icon: isRestarting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(LucideIcons.refreshCw, size: IconSizes.md),
                onPressed: isRestarting ? null : onRestart,
                tooltip: 'Restart sandbox',
                color: RuhTheme.textTertiary,
              ),
          ],
        ),
      ),
    );
  }
}
