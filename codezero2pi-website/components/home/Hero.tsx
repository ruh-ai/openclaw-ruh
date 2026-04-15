"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentNetwork } from "@/components/ui/AnimatedSVG";

const words = ["Self-Evolving", "Living", "Autonomous", "Intelligent"];

function RotatingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setIndex((i) => (i + 1) % words.length), 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-block relative h-[1.2em] overflow-hidden align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ y: 50, opacity: 0, filter: "blur(8px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: -50, opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
          className="gradient-text inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Ambient blobs */}
      <motion.div
        className="absolute top-0 -left-40 w-[600px] h-[600px] rounded-full bg-brand-purple/[0.06] blur-[100px]"
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" as const }}
      />
      <motion.div
        className="absolute bottom-0 -right-40 w-[500px] h-[500px] rounded-full bg-brand-violet/[0.06] blur-[100px]"
        animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" as const }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-32 pb-20 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-brand-border bg-white/60 backdrop-blur-sm px-4 py-2 shadow-sm"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-cyan opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-cyan" />
              </span>
              <span className="font-mono text-xs text-brand-text-secondary">
                Built on Ruh.ai &middot; Hermes &middot; OpenClaw
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-5xl font-bold leading-[1.08] tracking-tight md:text-6xl lg:text-[4.2rem]"
            >
              We Build{" "}
              <RotatingWord />
              <br />
              Software
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-6 max-w-lg text-lg text-brand-text-secondary leading-relaxed"
            >
              Your first working product in <strong className="text-brand-purple">days, not months</strong>.
              Software that doesn&apos;t just ship — it learns, adapts, and evolves
              on its own. Powered by autonomous coding agents and self-improving
              AI infrastructure.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-10 flex flex-wrap gap-4"
            >
              <Link href="/contact" className="btn-primary group px-8 py-4 text-sm">
                Build With Us
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
              </Link>
              <Link href="/services" className="btn-secondary px-8 py-4 text-sm">
                How It Works
              </Link>
            </motion.div>

            {/* Punchy stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              className="mt-14 flex items-center gap-8"
            >
              {[
                { value: "Days", label: "to first iteration" },
                { value: "24/7", label: "autonomous agents" },
                { value: "Self-", label: "evolving software" },
              ].map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-8">
                  {i > 0 && <div className="h-8 w-px bg-brand-border" />}
                  <div className="text-center">
                    <p className="font-display text-2xl font-bold gradient-text">{stat.value}</p>
                    <p className="text-xs text-brand-text-muted">{stat.label}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Animated SVG */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="hidden lg:flex items-center justify-center"
          >
            <AgentNetwork className="w-full max-w-md" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
