import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/theme.dart';
import '../../models/agent.dart';
import '../../providers/agent_provider.dart';

/// Agent list page — the main dashboard showing all agents as cards in a grid.
class AgentListScreen extends ConsumerWidget {
  const AgentListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agentsAsync = ref.watch(agentListProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: ShaderMask(
          shaderCallback: (bounds) =>
              RuhTheme.brandGradient.createShader(bounds),
          child: Text(
            'Ruh',
            style: theme.textTheme.headlineLarge?.copyWith(
              color: Colors.white,
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.store, size: 20),
            onPressed: () => context.go('/marketplace'),
            tooltip: 'Marketplace',
          ),
          IconButton(
            icon: const Icon(LucideIcons.settings, size: 20),
            onPressed: () => context.go('/settings'),
            tooltip: 'Settings',
          ),
        ],
      ),
      body: agentsAsync.when(
        data: (agents) => agents.isEmpty
            ? _EmptyState()
            : _AgentGrid(agents: agents),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _ErrorState(
          error: err.toString(),
          onRetry: () => ref.read(agentListProvider.notifier).refresh(),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: RuhTheme.brandGradient,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: RuhTheme.primary.withValues(alpha: 0.2),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Center(
                child: Icon(LucideIcons.bot, color: Colors.white, size: 32),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'No agents yet',
              style: theme.textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Create agents in the builder to see them here.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: RuhTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

class _ErrorState extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorState({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.wifiOff, size: 40, color: RuhTheme.textTertiary),
            const SizedBox(height: 16),
            Text(
              'Could not load agents',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              error,
              style: TextStyle(color: RuhTheme.textTertiary, fontSize: 12),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(LucideIcons.refreshCw, size: 14),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Agent grid (responsive: 1/2/3 columns)
// ---------------------------------------------------------------------------

class _AgentGrid extends ConsumerWidget {
  final List<Agent> agents;

  const _AgentGrid({required this.agents});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final crossAxisCount = width >= 1024 ? 3 : width >= 600 ? 2 : 1;

        return GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossAxisCount,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: crossAxisCount == 1 ? 2.0 : 1.5,
          ),
          itemCount: agents.length,
          itemBuilder: (context, index) => _AgentCard(
            agent: agents[index],
            onTap: () => _openAgent(context, ref, agents[index]),
          ),
        );
      },
    );
  }

  void _openAgent(BuildContext context, WidgetRef ref, Agent agent) {
    ref.read(selectedAgentProvider.notifier).state = agent;
    ref.read(activeSandboxIdProvider.notifier).state =
        agent.sandboxIds.isNotEmpty ? agent.sandboxIds.first : null;
    context.go('/chat/${agent.id}');
  }
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

class _AgentCard extends StatefulWidget {
  final Agent agent;
  final VoidCallback onTap;

  const _AgentCard({required this.agent, required this.onTap});

  @override
  State<_AgentCard> createState() => _AgentCardState();
}

class _AgentCardState extends State<_AgentCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final agent = widget.agent;
    final theme = Theme.of(context);
    final isActive = agent.isActive;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: _hovered ? RuhTheme.lightPurple : theme.cardColor,
            borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
            border: Border.all(
              color: _hovered
                  ? RuhTheme.primary.withValues(alpha: 0.3)
                  : RuhTheme.borderDefault,
            ),
            boxShadow: [
              if (_hovered)
                BoxShadow(
                  color: RuhTheme.primary.withValues(alpha: 0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top row: avatar + name + status
                Row(
                  children: [
                    // Avatar emoji circle
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: RuhTheme.accentLight,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: Text(
                          agent.avatar,
                          style: const TextStyle(fontSize: 20),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            agent.name,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          // Status badge
                          Row(
                            children: [
                              Container(
                                width: 7,
                                height: 7,
                                decoration: BoxDecoration(
                                  color: isActive
                                      ? RuhTheme.success
                                      : RuhTheme.textTertiary,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                isActive ? 'Active' : 'Draft',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: isActive
                                      ? RuhTheme.success
                                      : RuhTheme.textTertiary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Description (2 lines, clamped)
                Expanded(
                  child: Text(
                    agent.description,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: RuhTheme.textSecondary,
                      height: 1.4,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),

                const SizedBox(height: 8),

                // Bottom row: chips + chat button
                Row(
                  children: [
                    // Skills chip
                    _InfoChip(
                      icon: LucideIcons.zap,
                      label: '${agent.skills.length} skills',
                    ),
                    const SizedBox(width: 8),
                    // Trigger chip
                    if (agent.triggerLabel.isNotEmpty) ...[
                      _InfoChip(
                        icon: LucideIcons.clock,
                        label: agent.triggerLabel,
                      ),
                      const SizedBox(width: 8),
                    ],
                    // Deployment count
                    _InfoChip(
                      icon: Icons.circle,
                      iconSize: 7,
                      iconColor: agent.isDeployed
                          ? RuhTheme.success
                          : RuhTheme.textTertiary,
                      label: '${agent.deploymentCount}',
                    ),
                    const Spacer(),
                    // Chat button
                    SizedBox(
                      height: 32,
                      child: ElevatedButton.icon(
                        onPressed: widget.onTap,
                        icon: const Icon(LucideIcons.messageSquare, size: 14),
                        label: const Text('Chat'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: RuhTheme.primary,
                          foregroundColor: Colors.white,
                          textStyle: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(RuhTheme.radiusMd),
                          ),
                        ),
                      ),
                    ),
                  ],
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
// Info chip (small, inline label with icon)
// ---------------------------------------------------------------------------

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final double iconSize;
  final Color? iconColor;

  const _InfoChip({
    required this.icon,
    required this.label,
    this.iconSize = 12,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: RuhTheme.accentLight,
        borderRadius: BorderRadius.circular(RuhTheme.radiusSm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: iconSize,
            color: iconColor ?? RuhTheme.textTertiary,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: RuhTheme.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
