import ScrollReveal from "@/components/ui/ScrollReveal";

const capabilities = [
  { title: "Hermes Self-Evolution", description: "Agents build procedural memory from experience. They create and refine their own skills through closed learning loops — getting smarter with every interaction.", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { title: "OpenClaw Agent Gateway", description: "Every agent runs in its own secure container with its own tools, memory, and personality. Universal gateway protocol with 200+ model providers.", icon: "M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4zM9 12l2 2 4-4" },
  { title: "Claude Code & Codex", description: "We don't just use AI — we're the best at wielding it. Our engineers pair with the most powerful coding agents on earth to deliver at superhuman speed.", icon: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" },
  { title: "Container-per-Agent", description: "Complete isolation, independent scaling, zero cross-contamination. Each agent is a first-class citizen with its own runtime environment.", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { title: "3,000+ Integrations", description: "Slack, HubSpot, Jira, Gmail, Salesforce — your agents connect to every tool your team already uses. No rip-and-replace, ever.", icon: "M4 12h4M16 12h4M12 4v4M12 16v4" },
  { title: "Autonomous Operations", description: "Your software monitors itself, fixes its own bugs, optimizes its own performance, and adapts to changing requirements — without waiting for a sprint.", icon: "M3 17l6-6 4 4 8-8M17 7h4v4" },
];

export default function Capabilities() {
  return (
    <section className="section-padding bg-brand-surface/50">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <p className="font-mono text-sm text-brand-purple mb-3">// our edge</p>
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Technology that sounds like science fiction
          </h2>
          <p className="mt-4 max-w-2xl text-brand-text-secondary">
            We build on open-source infrastructure that most companies don&apos;t even know exists yet.
            This isn&apos;t incremental improvement — it&apos;s a different category of software.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap, i) => (
            <ScrollReveal key={cap.title} delay={i * 0.08}>
              <div className="card group p-6 h-full">
                <div className="mb-4 inline-flex rounded-xl border border-brand-border bg-brand-surface p-3 text-brand-purple group-hover:bg-brand-purple/10 group-hover:border-brand-purple/30 transition-all duration-300">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={cap.icon} />
                  </svg>
                </div>
                <h3 className="font-display text-base font-semibold mb-2">{cap.title}</h3>
                <p className="text-sm text-brand-text-secondary leading-relaxed">{cap.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
