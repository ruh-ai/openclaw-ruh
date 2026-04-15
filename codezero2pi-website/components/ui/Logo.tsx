"use client";

import { motion } from "framer-motion";

export default function Logo({ className = "h-10" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Logomark — abstract "0→π" in a circle */}
      <svg viewBox="0 0 40 40" className="h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ae00d0" />
            <stop offset="100%" stopColor="#7b5aff" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill="url(#mark-grad)" />
        <motion.text
          x="20"
          y="26"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="18"
          fill="white"
          letterSpacing="-1"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" as const }}
        >
          0π
        </motion.text>
      </svg>

      {/* Wordmark */}
      <svg viewBox="0 0 160 32" className="h-[70%]" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text
          x="0"
          y="24"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="700"
          fontSize="22"
          fill="#1a0a2e"
          letterSpacing="-0.3"
        >
          CodeZero2Pi
        </text>
      </svg>
    </div>
  );
}
