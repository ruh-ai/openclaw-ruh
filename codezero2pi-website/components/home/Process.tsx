import ScrollReveal from "@/components/ui/ScrollReveal";

const steps = [
  {
    number: "01",
    title: "Dream It",
    timeline: "Day 1",
    description: "Tell us the impossible thing you want built. We'll show you how our agents and infrastructure make it real — today, not next quarter.",
  },
  {
    number: "02",
    title: "Ship It",
    timeline: "Days 2-5",
    description: "Claude Code and Codex agents work 24/7 alongside our engineers. You get a working product — not a mockup, not a deck — in days.",
  },
  {
    number: "03",
    title: "Evolve It",
    timeline: "Ongoing",
    description: "Your software doesn't freeze after launch. Hermes-powered learning loops let it fix bugs, adapt to usage patterns, and improve autonomously.",
  },
  {
    number: "04",
    title: "Scale It",
    timeline: "When Ready",
    description: "From proof-of-concept to enterprise scale. Each agent runs in its own OpenClaw container — independent, secure, infinitely scalable.",
  },
];

export default function Process() {
  return (
    <section className="section-padding">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <p className="font-mono text-sm text-brand-purple mb-3">// how we work</p>
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Dream it Monday. <span className="gradient-text">Ship it Friday.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-brand-text-secondary">
            While others are scheduling their kickoff meeting, your product is already live.
            Our autonomous coding agents compress months of work into days.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <ScrollReveal key={step.number} delay={i * 0.1}>
              <div className="card group p-6 h-full relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-center justify-between mb-5">
                  <span className="font-mono text-4xl font-bold gradient-text opacity-30">{step.number}</span>
                  <span className="font-mono text-xs text-brand-purple border border-brand-border rounded-full px-3 py-1">{step.timeline}</span>
                </div>
                <h3 className="font-display text-lg font-semibold mb-3">{step.title}</h3>
                <p className="text-sm text-brand-text-secondary leading-relaxed">{step.description}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
