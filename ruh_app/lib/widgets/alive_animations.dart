import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../config/theme.dart';

// ==========================================================================
// 1. Soul Pulse — breathing glow around agent avatars
// ==========================================================================

/// Wraps a child with a pulsing glow that signals the agent is "alive."
///
/// [intensity] 0.0–1.0 controls glow strength. An empty agent gets a faint
/// pulse; a fully-configured one gets a confident glow.
class SoulPulse extends StatefulWidget {
  final Widget child;
  final double intensity;
  final bool enabled;

  const SoulPulse({
    super.key,
    required this.child,
    this.intensity = 0.5,
    this.enabled = true,
  });

  @override
  State<SoulPulse> createState() => _SoulPulseState();
}

class _SoulPulseState extends State<SoulPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: (3000 - widget.intensity * 600).toInt()),
    );
    if (widget.enabled) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(SoulPulse old) {
    super.didUpdateWidget(old);
    if (widget.enabled && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.enabled && _controller.isAnimating) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return widget.child;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final glowRadius = 20.0 * widget.intensity * _controller.value;
        final spreadRadius = 4.0 * widget.intensity * _controller.value;
        final opacity = 0.12 * widget.intensity * _controller.value;

        return Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: RuhTheme.primary.withValues(alpha: opacity),
                blurRadius: glowRadius,
                spreadRadius: spreadRadius,
              ),
            ],
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

// ==========================================================================
// 2. Ambient Gradient Drift — living gradient background
// ==========================================================================

/// A container with a slowly drifting gradient. Used on hero sections
/// and brand-moment surfaces.
class GradientDrift extends StatefulWidget {
  final Widget child;
  final Duration duration;
  final List<Color>? colors;
  final BorderRadius? borderRadius;

  const GradientDrift({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 8),
    this.colors,
    this.borderRadius,
  });

  @override
  State<GradientDrift> createState() => _GradientDriftState();
}

class _GradientDriftState extends State<GradientDrift>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration)
      ..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors =
        widget.colors ??
        [RuhTheme.primary, RuhTheme.secondary, RuhTheme.primary];

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        // Shift the gradient alignment over time
        final t = _controller.value;
        final beginX = math.cos(t * 2 * math.pi);
        final beginY = math.sin(t * 2 * math.pi) * 0.5;

        return Container(
          decoration: BoxDecoration(
            borderRadius: widget.borderRadius,
            gradient: LinearGradient(
              begin: Alignment(beginX, beginY),
              end: Alignment(-beginX, -beginY),
              colors: colors,
            ),
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

// ==========================================================================
// 3. Spark Moment — celebratory scale+fade for milestones
// ==========================================================================

/// Plays a brief scale-up-then-settle animation when [trigger] changes to true.
/// Used for success states: tool connected, skill added, etc.
class SparkMoment extends StatefulWidget {
  final Widget child;
  final bool trigger;

  const SparkMoment({super.key, required this.child, this.trigger = false});

  @override
  State<SparkMoment> createState() => _SparkMomentState();
}

class _SparkMomentState extends State<SparkMoment>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.8, end: 1.05), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.05, end: 1.0), weight: 50),
    ]).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

    if (widget.trigger) _controller.forward();
  }

  @override
  void didUpdateWidget(SparkMoment old) {
    super.didUpdateWidget(old);
    if (widget.trigger && !old.trigger) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(scale: _scale, child: widget.child);
  }
}

// ==========================================================================
// 4. Breathing Focus — single-breath glow on input focus
// ==========================================================================

/// Wraps a text field and adds a breathing glow animation when focused.
/// Plays once on focus, then settles.
class BreathingFocus extends StatefulWidget {
  final Widget child;

  const BreathingFocus({super.key, required this.child});

  @override
  State<BreathingFocus> createState() => _BreathingFocusState();
}

class _BreathingFocusState extends State<BreathingFocus>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _isFocused = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChange(bool focused) {
    setState(() => _isFocused = focused);
    if (focused) {
      _controller.forward(from: 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: _onFocusChange,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          final t = _controller.value;
          // Single breath: expand then settle
          final glowSize = _isFocused
              ? (t < 0.5 ? t * 2 * 4.0 : (1.0 - (t - 0.5) * 2) * 4.0 + 2.0)
              : 0.0;
          final opacity = _isFocused ? 0.08 * (1.0 - t * 0.6) : 0.0;

          return Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(RuhTheme.radiusXxl),
              boxShadow: glowSize > 0
                  ? [
                      BoxShadow(
                        color: RuhTheme.primary.withValues(alpha: opacity),
                        blurRadius: glowSize,
                        spreadRadius: glowSize * 0.3,
                      ),
                    ]
                  : null,
            ),
            child: child,
          );
        },
        child: widget.child,
      ),
    );
  }
}

// ==========================================================================
// 5. Warmth Hover — radial gradient follows cursor on hover
// ==========================================================================

/// Adds a mouse-following warm purple radial gradient overlay on hover.
class WarmthHover extends StatefulWidget {
  final Widget child;
  final BorderRadius? borderRadius;

  const WarmthHover({super.key, required this.child, this.borderRadius});

  @override
  State<WarmthHover> createState() => _WarmthHoverState();
}

class _WarmthHoverState extends State<WarmthHover> {
  bool _hovering = false;
  Offset _mousePosition = Offset.zero;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      onHover: (event) => setState(() => _mousePosition = event.localPosition),
      child: Stack(
        children: [
          widget.child,
          if (_hovering)
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 300),
                  opacity: _hovering ? 1.0 : 0.0,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final relX = constraints.maxWidth > 0
                          ? _mousePosition.dx / constraints.maxWidth
                          : 0.5;
                      final relY = constraints.maxHeight > 0
                          ? _mousePosition.dy / constraints.maxHeight
                          : 0.5;

                      return Container(
                        decoration: BoxDecoration(
                          borderRadius: widget.borderRadius,
                          gradient: RadialGradient(
                            center: Alignment(relX * 2 - 1, relY * 2 - 1),
                            radius: 0.8,
                            colors: [
                              RuhTheme.primary.withValues(alpha: 0.06),
                              Colors.transparent,
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
