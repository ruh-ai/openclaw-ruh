"use client";

import { motion } from "framer-motion";

const industries = [
  "Banking & Finance", "Healthcare", "E-Commerce",
  "Marketing & Ads", "Supply Chain", "Real Estate",
];

export default function Clients() {
  return (
    <section className="section-padding border-y border-brand-border/50">
      <div className="mx-auto max-w-7xl">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center font-mono text-sm text-brand-text-muted mb-10"
        >
          Trusted across industries
        </motion.p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {industries.map((industry, i) => (
            <motion.div
              key={industry}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ scale: 1.03, borderColor: "rgba(174,0,208,0.3)" }}
              className="flex items-center justify-center rounded-xl border border-brand-border bg-white py-5 px-4 text-sm text-brand-text-secondary text-center transition-shadow hover:shadow-md"
            >
              {industry}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
