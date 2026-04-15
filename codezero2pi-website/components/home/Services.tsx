import Link from "next/link";
import ScrollReveal from "@/components/ui/ScrollReveal";

const services = [
  {
    id: "agents",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="16" cy="10" r="4" /><path d="M8 26c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
        <path d="M24 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M28 12h-6" strokeLinecap="round" />
      </svg>
    ),
    title: "Living AI Agents",
    description:
      "Agents that don't just execute — they learn, remember, and evolve. Built on Hermes self-improving architecture, every agent develops procedural memory and grows smarter with each interaction.",
    tags: ["Self-Evolving", "Hermes Architecture", "Procedural Memory"],
  },
  {
    id: "software",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="6" width="24" height="20" rx="3" />
        <path d="M12 14l-3 3 3 3M20 14l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 12l-2 8" strokeLinecap="round" />
      </svg>
    ),
    title: "Rapid Software Engineering",
    description:
      "First iteration in days, not months. Our coding agents (Claude Code, Codex) work 24/7 alongside human engineers, shipping production-ready code at speeds your competitors can't match.",
    tags: ["Claude Code", "Codex", "Days to Production"],
  },
  {
    id: "automation",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="16" r="3" /><circle cx="24" cy="8" r="3" /><circle cx="24" cy="24" r="3" />
        <path d="M11 15l10-6M11 17l10 6" strokeLinecap="round" />
      </svg>
    ),
    title: "Self-Evolving Systems",
    description:
      "Software that improves itself. Using OpenClaw's agent gateway and closed learning loops, your systems autonomously fix bugs, optimize performance, and adapt to changing requirements.",
    tags: ["OpenClaw", "Closed Learning Loops", "Auto-Evolution"],
  },
  {
    id: "strategy",
    icon: (
      <svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 26V12l10-6 10 6v14" strokeLinejoin="round" />
        <path d="M6 12l10 6 10-6" strokeLinejoin="round" /><path d="M16 18v8" />
      </svg>
    ),
    title: "AI-Native Architecture",
    description:
      "Every system we build has intelligence woven into its DNA. Not AI bolted onto legacy code — architecture designed from the ground up for autonomous operation, self-healing, and continuous improvement.",
    tags: ["AI-First Design", "Autonomous Ops", "Self-Healing"],
  },
];

export default function Services() {
  return (
    <section id="services" className="section-padding">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <p className="font-mono text-sm text-brand-purple mb-3">// what we build</p>
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Software that ships fast and <span className="gradient-text">never stops improving</span>
          </h2>
          <p className="mt-4 max-w-2xl text-brand-text-secondary">
            We don&apos;t just build and hand off. We deploy living systems — software and
            agents that autonomously learn, adapt, and evolve long after launch.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {services.map((service, i) => (
            <ScrollReveal key={service.id} delay={i * 0.1}>
              <Link href={`/services#${service.id}`} className="card group block p-8 h-full">
                <div className="mb-5 inline-flex rounded-xl bg-brand-gradient p-3 text-white shadow-lg shadow-brand-purple/20">
                  {service.icon}
                </div>
                <h3 className="font-display text-xl font-semibold mb-3 group-hover:text-brand-purple transition-colors duration-300">
                  {service.title}
                </h3>
                <p className="text-sm text-brand-text-secondary leading-relaxed mb-5">{service.description}</p>
                <div className="flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-brand-surface border border-brand-border px-3 py-1 text-xs text-brand-purple font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
