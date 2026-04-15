"use client";

import { motion } from "framer-motion";

/* Animated network/agent illustration */
export function AgentNetwork({ className = "" }: { className?: string }) {
  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: { duration: 1.5, delay: i * 0.2, ease: "easeInOut" as const },
    }),
  };

  const pulse = {
    scale: [1, 1.15, 1],
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const },
  };

  return (
    <motion.svg
      viewBox="0 0 400 400"
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      <defs>
        <linearGradient id="net-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ae00d0" />
          <stop offset="100%" stopColor="#7b5aff" />
        </linearGradient>
        <linearGradient id="net-grad-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ae00d0" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#7b5aff" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Connection lines */}
      <motion.line x1="200" y1="200" x2="80" y2="100" stroke="url(#net-grad-light)" strokeWidth="2" custom={0} variants={draw} />
      <motion.line x1="200" y1="200" x2="320" y2="90" stroke="url(#net-grad-light)" strokeWidth="2" custom={1} variants={draw} />
      <motion.line x1="200" y1="200" x2="340" y2="280" stroke="url(#net-grad-light)" strokeWidth="2" custom={2} variants={draw} />
      <motion.line x1="200" y1="200" x2="60" y2="300" stroke="url(#net-grad-light)" strokeWidth="2" custom={3} variants={draw} />
      <motion.line x1="200" y1="200" x2="200" y2="50" stroke="url(#net-grad-light)" strokeWidth="2" custom={4} variants={draw} />
      <motion.line x1="200" y1="200" x2="200" y2="350" stroke="url(#net-grad-light)" strokeWidth="2" custom={5} variants={draw} />

      {/* Outer nodes */}
      {[
        [80, 100], [320, 90], [340, 280], [60, 300], [200, 50], [200, 350],
      ].map(([cx, cy], i) => (
        <motion.circle
          key={i}
          cx={cx}
          cy={cy}
          r="18"
          fill="white"
          stroke="url(#net-grad)"
          strokeWidth="2"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 + i * 0.15, type: "spring", stiffness: 200 }}
        />
      ))}

      {/* Center node - pulsing */}
      <motion.circle
        cx="200"
        cy="200"
        r="32"
        fill="url(#net-grad)"
        animate={pulse}
      />
      <motion.circle
        cx="200"
        cy="200"
        r="32"
        fill="none"
        stroke="url(#net-grad)"
        strokeWidth="1"
        strokeOpacity="0.3"
        animate={{ r: [32, 50, 32], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" as const }}
      />

      {/* Labels on outer nodes */}
      {[
        [80, 104, "CRM"], [320, 94, "Email"], [340, 284, "Slack"],
        [60, 304, "Jira"], [200, 54, "API"], [200, 354, "DB"],
      ].map(([x, y, label], i) => (
        <motion.text
          key={i}
          x={x as number}
          y={y as number}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[10px] font-semibold fill-brand-purple"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 + i * 0.1 }}
        >
          {label as string}
        </motion.text>
      ))}

      {/* Center label */}
      <text
        x="200"
        y="200"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[11px] font-bold fill-white"
      >
        AGENT
      </text>
    </motion.svg>
  );
}

/* Animated code/terminal SVG */
export function CodeAnimation({ className = "" }: { className?: string }) {
  const line = {
    hidden: { width: 0, opacity: 0 },
    visible: (i: number) => ({
      width: "100%",
      opacity: 1,
      transition: { duration: 0.6, delay: i * 0.3, ease: "easeOut" as const },
    }),
  };

  return (
    <motion.svg
      viewBox="0 0 360 240"
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      {/* Terminal window */}
      <rect x="0" y="0" width="360" height="240" rx="12" fill="white" stroke="#e8ddf0" strokeWidth="1.5" />
      <rect x="0" y="0" width="360" height="36" rx="12" fill="#f3eef8" />
      <rect x="0" y="24" width="360" height="12" fill="#f3eef8" />
      <circle cx="18" cy="18" r="5" fill="#ff6b6b" />
      <circle cx="36" cy="18" r="5" fill="#ffd93d" />
      <circle cx="54" cy="18" r="5" fill="#6bcb77" />

      {/* Code lines with stagger animation */}
      {[
        { y: 56, w: 180, color: "#ae00d0" },
        { y: 76, w: 240, color: "#7b5aff" },
        { y: 96, w: 160, color: "#ae00d0" },
        { y: 116, w: 200, color: "#7b5aff" },
        { y: 146, w: 120, color: "#06d6a0" },
        { y: 166, w: 280, color: "#ae00d0" },
        { y: 186, w: 140, color: "#7b5aff" },
        { y: 206, w: 220, color: "#06d6a0" },
      ].map((l, i) => (
        <motion.rect
          key={i}
          x="20"
          y={l.y}
          height="8"
          rx="4"
          fill={l.color}
          opacity="0.15"
          custom={i}
          variants={line}
          style={{ width: l.w }}
        />
      ))}

      {/* Cursor blink */}
      <motion.rect
        x="20"
        y="220"
        width="8"
        height="12"
        rx="1"
        fill="#ae00d0"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </motion.svg>
  );
}
