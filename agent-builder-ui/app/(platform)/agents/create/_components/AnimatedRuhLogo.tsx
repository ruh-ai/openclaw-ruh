"use client";

/**
 * Animated Ruh logo mark — the dot constellation from the brand.
 *
 * Animation: Each dot starts as a tiny purple speck, slowly grows to full size
 * while fading from purple → white, then vanishes — and the cycle restarts.
 * Dots are staggered so the constellation ripples outward from center.
 *
 * Modes:
 * - "idle"         — slow, dreamy lifecycle (4s per dot)
 * - "provisioning" — faster pulse, dots build outward with progress
 * - "alive"        — confident, quicker lifecycle (2.5s per dot)
 */

interface AnimatedRuhLogoProps {
  mode: "idle" | "provisioning" | "alive";
  /** 0-1 progress for provisioning mode (controls how many dots are visible) */
  progress?: number;
  /** Size in px (default 80) */
  size?: number;
  className?: string;
}

// Dots from the Ruh logo, organized center → outward.
const DOTS: Array<{ cx: number; cy: number; r: number; layer: number }> = [
  // Layer 0: Center
  { cx: 252, cy: 245, r: 36, layer: 0 },
  // Layer 1: Inner diamond
  { cx: 139, cy: 135, r: 24, layer: 1 },
  { cx: 370, cy: 135, r: 24, layer: 1 },
  { cx: 139, cy: 370, r: 24, layer: 1 },
  { cx: 370, cy: 370, r: 24, layer: 1 },
  // Layer 2: Cardinal points
  { cx: 252, cy: 25, r: 26, layer: 2 },
  { cx: 472, cy: 247, r: 26, layer: 2 },
  { cx: 252, cy: 467, r: 22, layer: 2 },
  { cx: 32, cy: 247, r: 26, layer: 2 },
  // Layer 3: Ring positions (rendered as filled dots too for this animation)
  { cx: 370, cy: 245, r: 40, layer: 3 },
  { cx: 139, cy: 245, r: 40, layer: 3 },
  { cx: 252, cy: 135, r: 40, layer: 3 },
  { cx: 252, cy: 370, r: 36, layer: 3 },
  // Layer 4: Corner dots
  { cx: 145, cy: 42, r: 14, layer: 4 },
  { cx: 362, cy: 42, r: 14, layer: 4 },
  { cx: 42, cy: 150, r: 13, layer: 4 },
  { cx: 462, cy: 150, r: 13, layer: 4 },
  { cx: 42, cy: 347, r: 13, layer: 4 },
  { cx: 462, cy: 347, r: 13, layer: 4 },
  { cx: 145, cy: 462, r: 14, layer: 4 },
  { cx: 362, cy: 462, r: 14, layer: 4 },
];

const MAX_LAYER = 4;

export function AnimatedRuhLogo({
  mode,
  progress = 0,
  size = 80,
  className = "",
}: AnimatedRuhLogoProps) {
  const visibleLayers = mode === "provisioning"
    ? Math.floor(progress * (MAX_LAYER + 1))
    : MAX_LAYER + 1;

  // Lifecycle duration per mode
  const cycleDuration = mode === "alive" ? 2.5 : mode === "provisioning" ? 3 : 4;
  // Total stagger spread so dots ripple outward
  const maxStagger = cycleDuration * 0.6;

  return (
    <svg
      viewBox="0 0 504 504"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Ruh logo"
    >
      <defs>
        {/* Purple start color */}
        <linearGradient id="ruh-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ae00d0" />
          <stop offset="100%" stopColor="#8422f7" />
        </linearGradient>
      </defs>

      {DOTS.map((dot, i) => {
        const isActive = dot.layer < visibleLayers;

        // Stagger delay: center dots start first, outer dots follow
        const layerRatio = dot.layer / MAX_LAYER;
        const posOffset = (i % 4) * 0.08;
        const delay = layerRatio * maxStagger + posOffset;

        if (!isActive && mode === "provisioning") {
          // Not yet revealed — show as tiny faint speck
          return (
            <circle
              key={i}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r * 0.15}
              fill="#ae00d0"
              opacity={0.1}
            />
          );
        }

        return (
          <circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.r}
            fill="url(#ruh-purple)"
            style={{
              transformOrigin: `${dot.cx}px ${dot.cy}px`,
              animation: `ruh-lifecycle ${cycleDuration}s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}

      <style>{`
        @keyframes ruh-lifecycle {
          0% {
            transform: scale(0.15);
            fill: #ae00d0;
            opacity: 0.6;
          }
          40% {
            transform: scale(0.7);
            fill: #b840e0;
            opacity: 1;
          }
          70% {
            transform: scale(1);
            fill: #ffffff;
            opacity: 0.9;
          }
          90% {
            transform: scale(1.05);
            fill: #ffffff;
            opacity: 0.3;
          }
          100% {
            transform: scale(0.15);
            fill: #ae00d0;
            opacity: 0;
          }
        }
      `}</style>
    </svg>
  );
}
