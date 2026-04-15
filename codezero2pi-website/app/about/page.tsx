import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | CodeZero2Pi",
  description:
    "From zero to intelligent. We're a team of AI engineers and builders creating autonomous agents and software for businesses worldwide.",
};

const values = [
  {
    title: "Ship, Don't Slide-Deck",
    description:
      "We don't produce 100-page strategy documents. We build working software. You see progress every week, not every quarter.",
  },
  {
    title: "AI-Native, Not AI-Bolted",
    description:
      "Every solution we build has intelligence at its core. We don't add AI to existing software — we build software that thinks.",
  },
  {
    title: "Your Stack, Your Data",
    description:
      "We integrate with what you have. No vendor lock-in, no proprietary platforms you can't leave. Your data stays yours.",
  },
  {
    title: "Honest Engineering",
    description:
      "If something won't work, we'll tell you before you pay for it. If there's a simpler solution, we'll recommend it even if it means less work for us.",
  },
];

const timeline = [
  {
    year: "2017",
    event: "Rapid Innovation founded",
    detail:
      "Started as a technology consulting firm, building enterprise software and blockchain solutions for clients worldwide.",
  },
  {
    year: "2024",
    event: "Ruh.ai platform begins",
    detail:
      "Began building the agentic AI platform that would become the infrastructure for autonomous digital employees.",
  },
  {
    year: "2025",
    event: "CodeZero2Pi launches",
    detail:
      "Spun out as the services arm — bringing Ruh.ai's agentic infrastructure directly to enterprises who need custom AI solutions.",
  },
  {
    year: "Now",
    event: "Building the future of work",
    detail:
      "Deploying AI agents and intelligent software for companies across finance, healthcare, marketing, e-commerce, and more.",
  },
];

export default function AboutPage() {
  return (
    <div className="pt-24">
      {/* Hero */}
      <section className="section-padding pb-12">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-sm text-brand-purple mb-3">// about us</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl max-w-3xl">
            From <span className="gradient-text">zero</span> to intelligent
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-brand-text-secondary leading-relaxed">
            CodeZero2Pi exists because we believe every business deserves AI
            that actually works — not demos that impress in meetings but fail in
            production. We build agents and software that run, scale, and
            deliver real ROI.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="section-padding bg-brand-surface/50">
        <div className="mx-auto max-w-7xl grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl mb-6">
              Born from builders, for builders
            </h2>
            <div className="space-y-4 text-brand-text-secondary leading-relaxed">
              <p>
                CodeZero2Pi is the services arm of a technology ecosystem built
                over nearly a decade.{" "}
                <a
                  href="https://rapidinnovation.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:text-brand-purple-dark"
                >
                  Rapid Innovation
                </a>{" "}
                has been building enterprise software since 2017 — hundreds of
                projects across finance, healthcare, e-commerce, and beyond.
              </p>
              <p>
                When we started building AI agents, we realized the infrastructure
                didn&apos;t exist. So we built{" "}
                <a
                  href="https://ruh.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-purple hover:text-brand-purple-dark"
                >
                  Ruh.ai
                </a>{" "}
                — a platform for creating digital employees with personality,
                context, and judgment. Agents that feel like real teammates, not
                chatbots.
              </p>
              <p>
                CodeZero2Pi brings that infrastructure directly to you. We use
                Ruh.ai&apos;s agentic platform, Rapid Innovation&apos;s engineering
                depth, and a proven delivery methodology to build AI solutions
                that go live in weeks — not quarters.
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-8">
            {timeline.map((item) => (
              <div key={item.year} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <span className="font-mono text-sm font-bold text-brand-purple">
                    {item.year}
                  </span>
                  <div className="mt-2 h-full w-px bg-brand-border" />
                </div>
                <div className="pb-8">
                  <h3 className="font-display text-base font-semibold mb-1">
                    {item.event}
                  </h3>
                  <p className="text-sm text-brand-text-muted">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-sm text-brand-purple mb-3">
            // how we operate
          </p>
          <h2 className="font-display text-2xl font-bold md:text-3xl mb-12">
            Principles, not platitudes
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {values.map((value) => (
              <div
                key={value.title}
                className="card rounded-xl border border-brand-border p-6"
              >
                <h3 className="font-display text-base font-semibold mb-2">
                  {value.title}
                </h3>
                <p className="text-sm text-brand-text-muted leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="section-padding bg-brand-surface/50">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-sm text-brand-purple mb-3">
            // leadership
          </p>
          <h2 className="font-display text-2xl font-bold md:text-3xl mb-12">
            The people behind the agents
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* Prasanjit */}
            <div className="card rounded-xl border border-brand-border p-8">
              <div className="mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-brand-purple to-brand-violet flex items-center justify-center text-2xl font-bold text-white font-display">
                PD
              </div>
              <h3 className="font-display text-lg font-semibold">
                Prasanjit Dey
              </h3>
              <p className="text-sm text-brand-purple mb-3">Founder & CEO</p>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Engineer turned entrepreneur. Leads the technical vision and
                delivery at CodeZero2Pi. Previously built enterprise AI
                solutions at Rapid Innovation, now focused on making agentic AI
                accessible to every business.
              </p>
            </div>

            {/* Jesse */}
            <div className="card rounded-xl border border-brand-border p-8">
              <div className="mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-brand-violet to-brand-purple flex items-center justify-center text-2xl font-bold text-white font-display">
                JA
              </div>
              <h3 className="font-display text-lg font-semibold">
                Jesse Anglen
              </h3>
              <p className="text-sm text-brand-purple mb-3">
                CEO, Rapid Innovation
              </p>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Visionary behind the Rapid Innovation ecosystem. Leads the
                broader technology strategy and enterprise relationships that
                power CodeZero2Pi&apos;s delivery capabilities.
              </p>
            </div>

            {/* Engineering team placeholder */}
            <div className="card rounded-xl border border-brand-border p-8 flex flex-col items-center justify-center text-center">
              <div className="mb-6 h-20 w-20 rounded-full border-2 border-dashed border-brand-purple/30 flex items-center justify-center text-brand-purple">
                <svg
                  className="h-8 w-8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold">
                Engineering Team
              </h3>
              <p className="text-sm text-brand-purple mb-3">30+ Engineers</p>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Top 3% of engineers across AI/ML, full-stack development,
                DevOps, and cloud infrastructure. Based in the US and India.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-2xl font-bold md:text-3xl mb-4">
            Want to work with us?
          </h2>
          <p className="text-brand-text-secondary mb-8">
            Whether you have a clear project in mind or just want to explore
            what AI can do for your business, we&apos;re here to talk.
          </p>
          <Link
            href="/contact"
            className="inline-block btn-primary px-8 py-4 text-sm font-medium text-white transition-all duration-300"
          >
            Get in Touch &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
