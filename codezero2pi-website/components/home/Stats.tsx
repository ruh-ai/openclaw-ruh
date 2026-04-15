"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

function CountUp({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = Date.now();
          const tick = () => {
            const p = Math.min((Date.now() - start) / 2000, 1);
            setCount(Math.round((1 - Math.pow(1 - p, 3)) * end));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

const stats = [
  { end: 5, suffix: "", label: "Days to first working product", unit: "days" },
  { end: 10, suffix: "x", label: "Faster than traditional development", unit: "" },
  { end: 3000, suffix: "+", label: "Tool integrations ready to connect", unit: "" },
  { end: 24, suffix: "/7", label: "Coding agents never sleep", unit: "" },
];

export default function Stats() {
  return (
    <section className="section-padding bg-brand-gradient-soft">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center p-6"
            >
              <p className="font-display text-4xl font-bold gradient-text md:text-5xl">
                <CountUp end={stat.end} suffix={stat.suffix} />
              </p>
              {stat.unit && <p className="text-sm text-brand-purple font-medium mt-1">{stat.unit}</p>}
              <p className="mt-2 text-sm text-brand-text-muted">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
