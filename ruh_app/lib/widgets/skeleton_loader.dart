import 'package:flutter/material.dart';

import '../config/theme.dart';

/// A shimmer-effect skeleton placeholder for loading states.
class SkeletonLoader extends StatefulWidget {
  final double width;
  final double height;
  final double borderRadius;

  const SkeletonLoader({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.borderRadius = RuhTheme.radiusMd,
  });

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.borderRadius),
            gradient: LinearGradient(
              begin: Alignment(-1.0 + 2.0 * _controller.value, 0),
              end: Alignment(-1.0 + 2.0 * _controller.value + 1.0, 0),
              colors: const [
                RuhTheme.borderMuted,
                RuhTheme.accentLight,
                RuhTheme.borderMuted,
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A card-shaped skeleton for agent list loading.
class AgentCardSkeleton extends StatelessWidget {
  const AgentCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: RuhTheme.cardColor,
        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SkeletonLoader(width: 40, height: 40, borderRadius: 10),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonLoader(width: 120, height: 14),
                    SizedBox(height: 6),
                    SkeletonLoader(width: 60, height: 10),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: 12),
          SkeletonLoader(height: 12),
          SizedBox(height: 6),
          SkeletonLoader(width: 200, height: 12),
        ],
      ),
    );
  }
}

/// A row-shaped skeleton for conversation list loading.
class ConversationSkeleton extends StatelessWidget {
  const ConversationSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: RuhTheme.cardColor,
        borderRadius: BorderRadius.circular(RuhTheme.radiusXl),
        border: Border.all(color: RuhTheme.borderDefault),
      ),
      child: const Row(
        children: [
          SkeletonLoader(width: 18, height: 18, borderRadius: 4),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLoader(width: 160, height: 14),
                SizedBox(height: 4),
                SkeletonLoader(width: 100, height: 10),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
