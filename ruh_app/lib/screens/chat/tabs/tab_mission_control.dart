import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../config/theme.dart';
import '../../../models/agent.dart';
import '../../../models/sandbox.dart';
import '../../../providers/agent_provider.dart';

/// Mission control dashboard showing agent status, skills, rules, and memory.
class TabMissionControl extends ConsumerStatefulWidget {
  final Agent? agent;
  final String? sandboxId;

  const TabMissionControl({
    super.key,
    required this.agent,
    required this.sandboxId,
  });

  @override
  ConsumerState<TabMissionControl> createState() => _TabMissionControlState();
}

class _TabMissionControlState extends ConsumerState<TabMissionControl> {
  SandboxHealth? _health;
  bool _healthLoading = false;

  @override
  void initState() {
    super.initState();
    _loadHealth();
  }

  @override
  void didUpdateWidget(TabMissionControl oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sandboxId != widget.sandboxId) {
      _loadHealth();
    }
  }

  Future<void> _loadHealth() async {
    if (widget.sandboxId == null) return;

    setState(() => _healthLoading = true);
    try {
      final service = ref.read(agentServiceProvider);
      final health = await service.getSandboxHealth(widget.sandboxId!);
      if (mounted) {
        setState(() {
          _health = health;
          _healthLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _healthLoading = false);
    }
  }

  Future<void> _restartSandbox() async {
    if (widget.sandboxId == null) return;
    try {
      final service = ref.read(agentServiceProvider);
      await service.restartSandbox(widget.sandboxId!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sandbox restart initiated')),
        );
      }
      await _loadHealth();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Restart failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final agent = widget.agent;

    if (agent == null) {
      return const Center(
        child: Text(
          'No agent selected.',
          style: TextStyle(color: RuhTheme.textTertiary),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // ── Gateway Status ──
        _SectionTitle(title: 'Gateway Status', icon: LucideIcons.activity),
        const SizedBox(height: 8),
        _buildStatusCards(),
        const SizedBox(height: 24),

        // ── Activity ──
        _SectionTitle(title: 'Activity', icon: LucideIcons.barChart3),
        const SizedBox(height: 8),
        _buildActivityCards(),
        const SizedBox(height: 24),

        // ── Quick Actions ──
        _SectionTitle(title: 'Quick Actions', icon: LucideIcons.zap),
        const SizedBox(height: 8),
        _buildQuickActions(),
        const SizedBox(height: 24),

        // ── Loaded Skills ──
        _SectionTitle(title: 'Loaded Skills', icon: LucideIcons.wrench),
        const SizedBox(height: 8),
        _buildSkillsList(agent),
        const SizedBox(height: 24),

        // ── Agent Rules ──
        _SectionTitle(title: 'Agent Rules', icon: LucideIcons.shield),
        const SizedBox(height: 8),
        _buildRulesList(agent),
        const SizedBox(height: 24),

        // ── Workspace Memory ──
        _SectionTitle(title: 'Workspace Memory', icon: LucideIcons.brain),
        const SizedBox(height: 8),
        _buildWorkspaceMemory(agent),
        const SizedBox(height: 32),
      ],
    );
  }

  // ── Gateway status cards ──
  Widget _buildStatusCards() {
    return Row(
      children: [
        Expanded(
          child: _StatusCard(
            title: 'Health',
            value: _healthLoading
                ? '...'
                : _health?.isHealthy == true
                    ? 'Healthy'
                    : _health?.gatewayStatus ?? 'Unknown',
            icon: LucideIcons.heartPulse,
            color: _health?.isHealthy == true ? RuhTheme.success : RuhTheme.warning,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusCard(
            title: 'Port',
            value: _health?.gatewayPort?.toString() ?? '--',
            icon: LucideIcons.network,
            color: RuhTheme.info,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusCard(
            title: 'Deployed',
            value: _health?.deployedAt != null
                ? _formatDeployTime(_health!.deployedAt!)
                : '--',
            icon: LucideIcons.clock,
            color: RuhTheme.secondary,
          ),
        ),
      ],
    );
  }

  // ── Activity cards ──
  Widget _buildActivityCards() {
    final agent = widget.agent!;
    return Row(
      children: [
        Expanded(
          child: _StatusCard(
            title: 'Conversations',
            value: _health?.conversationCount.toString() ?? '0',
            icon: LucideIcons.messageSquare,
            color: RuhTheme.primary,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusCard(
            title: 'Skills',
            value: agent.skills.length.toString(),
            icon: LucideIcons.zap,
            color: RuhTheme.secondary,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusCard(
            title: 'Instances',
            value: agent.deploymentCount.toString(),
            icon: LucideIcons.server,
            color: RuhTheme.success,
          ),
        ),
      ],
    );
  }

  // ── Quick actions ──
  Widget _buildQuickActions() {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () {
              // Push config — placeholder action
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Push config not yet implemented')),
              );
            },
            icon: const Icon(LucideIcons.upload, size: 16),
            label: const Text('Push Config'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: _restartSandbox,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text('Restart Sandbox'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      ],
    );
  }

  // ── Skills list ──
  Widget _buildSkillsList(Agent agent) {
    final skills = <String>[];

    // Gather from skillGraph if available
    if (agent.skillGraph != null) {
      for (final item in agent.skillGraph!) {
        if (item is Map<String, dynamic>) {
          skills.add(item['name']?.toString() ?? item.toString());
        } else {
          skills.add(item.toString());
        }
      }
    }

    // Fall back to agent.skills
    if (skills.isEmpty) {
      skills.addAll(agent.skills);
    }

    if (skills.isEmpty) {
      return _EmptyCard(
        message: 'No skills loaded',
        icon: LucideIcons.wrench,
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: skills.map((skill) {
            return Chip(
              avatar: Icon(LucideIcons.zap, size: 14, color: RuhTheme.primary),
              label: Text(
                skill,
                style: const TextStyle(fontSize: 13),
              ),
              backgroundColor: RuhTheme.accentLight,
              side: BorderSide.none,
            );
          }).toList(),
        ),
      ),
    );
  }

  // ── Rules list ──
  Widget _buildRulesList(Agent agent) {
    if (agent.agentRules.isEmpty) {
      return _EmptyCard(
        message: 'No rules configured',
        icon: LucideIcons.shield,
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: agent.agentRules.map((rule) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Icon(LucideIcons.chevronRight,
                        size: 14, color: RuhTheme.primary),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      rule,
                      style: const TextStyle(
                        fontSize: 13,
                        color: RuhTheme.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  // ── Workspace memory ──
  Widget _buildWorkspaceMemory(Agent agent) {
    final memory = agent.workspaceMemory;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Instructions
            Text(
              'Instructions',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: RuhTheme.accentLight,
                borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
              ),
              child: Text(
                memory?.instructions.isNotEmpty == true
                    ? memory!.instructions
                    : 'No instructions set.',
                style: const TextStyle(
                  fontSize: 13,
                  color: RuhTheme.textSecondary,
                  height: 1.4,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Continuity summary
            Text(
              'Continuity Summary',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: RuhTheme.accentLight,
                borderRadius: BorderRadius.circular(RuhTheme.radiusMd),
              ),
              child: Text(
                memory?.continuitySummary.isNotEmpty == true
                    ? memory!.continuitySummary
                    : 'No continuity summary.',
                style: const TextStyle(
                  fontSize: 13,
                  color: RuhTheme.textSecondary,
                  height: 1.4,
                ),
              ),
            ),

            // Pinned paths
            if (memory != null && memory.pinnedPaths.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(
                'Pinned Paths',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 6),
              ...memory.pinnedPaths.map((path) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.file,
                          size: 14, color: RuhTheme.textTertiary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          path,
                          style: const TextStyle(
                            fontSize: 12,
                            fontFamily: 'monospace',
                            color: RuhTheme.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }

  String _formatDeployTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

// ---------------------------------------------------------------------------
// Shared widgets
// ---------------------------------------------------------------------------

class _SectionTitle extends StatelessWidget {
  final String title;
  final IconData icon;

  const _SectionTitle({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: RuhTheme.primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatusCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 14, color: color),
                const SizedBox(width: 6),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 11,
                    color: RuhTheme.textTertiary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final String message;
  final IconData icon;

  const _EmptyCard({required this.message, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 24, color: RuhTheme.textTertiary),
              const SizedBox(height: 8),
              Text(
                message,
                style: const TextStyle(
                  fontSize: 13,
                  color: RuhTheme.textTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
