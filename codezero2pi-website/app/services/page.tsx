import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Services | CodeZero2Pi",
  description:
    "AI agent development, custom software engineering, automation, and AI strategy. Production-ready solutions from concept to deployment.",
};

const services = [
  {
    id: "agents",
    label: "AI Agent Development",
    headline: "Autonomous agents that think, plan, and act",
    description:
      "We build AI agents that go far beyond chatbots. Our agents understand context, use tools, remember past interactions, and execute multi-step workflows autonomously. Each agent runs in its own secure container with access to the tools it needs.",
    features: [
      {
        title: "Conversational Assistants",
        detail:
          "Domain-expert agents that handle customer inquiries, onboard users, and provide technical support — with personality and judgment.",
      },
      {
        title: "Workflow Automation Agents",
        detail:
          "Agents that manage end-to-end business processes: lead qualification, invoice processing, inventory management, compliance reporting.",
      },
      {
        title: "Data & Analytics Agents",
        detail:
          "Agents that monitor dashboards, detect anomalies, generate reports, and surface insights — without waiting to be asked.",
      },
      {
        title: "Multi-Agent Orchestration",
        detail:
          "Complex systems where specialized agents collaborate: one researches, one writes, one reviews, one deploys. Like a team, not a tool.",
      },
    ],
    tech: [
      "Custom LLM orchestration",
      "Tool use via MCP",
      "Persistent memory",
      "Container isolation",
      "Real-time streaming",
    ],
  },
  {
    id: "software",
    label: "Custom Software Engineering",
    headline: "Full-stack applications built AI-native",
    description:
      "Every application we build has AI at its core — not bolted on. From web platforms and APIs to dashboards and internal tools, we engineer software that's intelligent from the ground up.",
    features: [
      {
        title: "Web Applications",
        detail:
          "Modern React/Next.js applications with real-time features, authentication, role-based access, and pixel-perfect interfaces.",
      },
      {
        title: "API Development",
        detail:
          "High-performance APIs with streaming support, webhook integrations, rate limiting, and comprehensive documentation.",
      },
      {
        title: "Dashboards & Admin Panels",
        detail:
          "Real-time monitoring, analytics, and control surfaces for managing your agents, data, and operations.",
      },
      {
        title: "Mobile Applications",
        detail:
          "Cross-platform mobile apps with Flutter — native performance, single codebase, AI-powered features built in.",
      },
    ],
    tech: [
      "Next.js / React",
      "Node.js / Bun",
      "PostgreSQL",
      "Docker / Kubernetes",
      "Flutter",
    ],
  },
  {
    id: "automation",
    label: "Automation & Integration",
    headline: "Your existing stack, supercharged with AI",
    description:
      "We connect your tools into intelligent workflows — no rip-and-replace required. With 3,000+ integrations available, we wire up your CRM, email, calendar, databases, and custom systems into automated pipelines that run 24/7.",
    features: [
      {
        title: "Tool Integration",
        detail:
          "Connect Slack, Gmail, Jira, GitHub, HubSpot, Salesforce, Google Sheets, and thousands more. Your agents work where your team works.",
      },
      {
        title: "Business Process Automation",
        detail:
          "Automate repetitive workflows: lead routing, report generation, data entry, approval chains, notification systems.",
      },
      {
        title: "Data Pipeline Orchestration",
        detail:
          "ETL pipelines, real-time data sync, event-driven processing. Your data flows where it needs to, when it needs to.",
      },
      {
        title: "Legacy System Modernization",
        detail:
          "Add AI capabilities to existing systems through API wrappers, middleware, and intelligent routing layers — without rewriting what works.",
      },
    ],
    tech: [
      "3,000+ integrations",
      "Model Context Protocol",
      "Webhook orchestration",
      "Event-driven architecture",
      "REST / GraphQL",
    ],
  },
  {
    id: "strategy",
    label: "AI Strategy & Consulting",
    headline: "See what's possible. Get there fast.",
    description:
      "Not sure where to start? We help you identify the highest-value automation opportunities in your business, build a realistic roadmap, and quantify the ROI before writing any code.",
    features: [
      {
        title: "AI Readiness Assessment",
        detail:
          "We evaluate your current systems, data, and processes to determine where AI creates immediate value vs. where it needs groundwork first.",
      },
      {
        title: "Automation Opportunity Mapping",
        detail:
          "A prioritized map of every workflow that can be automated, ranked by impact, feasibility, and time to value.",
      },
      {
        title: "Technology Roadmap",
        detail:
          "A concrete plan: what to build, in what order, with what tools. No 100-page strategy decks — just a clear path from here to there.",
      },
      {
        title: "ROI Modeling",
        detail:
          "We model the expected return on each automation initiative so you can make investment decisions with confidence.",
      },
    ],
    tech: [
      "Workflow audits",
      "Cost-benefit analysis",
      "Technology evaluation",
      "Implementation planning",
      "Change management",
    ],
  },
];

export default function ServicesPage() {
  return (
    <div className="pt-24">
      {/* Page header */}
      <section className="section-padding pb-12">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-sm text-brand-purple mb-3">// services</p>
          <h1 className="font-display text-4xl font-bold md:text-5xl max-w-3xl">
            Everything you need to{" "}
            <span className="gradient-text">build with AI</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-brand-text-secondary">
            From strategy to deployment, we handle the full lifecycle. Every
            solution is production-ready, enterprise-grade, and built to scale.
          </p>
        </div>
      </section>

      {/* Service sections */}
      {services.map((service, index) => (
        <section
          key={service.id}
          id={service.id}
          className={`section-padding ${
            index % 2 === 0 ? "" : "bg-brand-surface/50"
          }`}
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left: description */}
              <div>
                <span className="inline-block rounded-full border border-brand-purple/20 bg-brand-purple/5 px-4 py-1.5 font-mono text-xs text-brand-purple mb-6">
                  {service.label}
                </span>
                <h2 className="font-display text-2xl font-bold md:text-3xl mb-4">
                  {service.headline}
                </h2>
                <p className="text-brand-text-secondary leading-relaxed mb-8">
                  {service.description}
                </p>

                {/* Tech tags */}
                <div className="flex flex-wrap gap-2">
                  {service.tech.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-brand-purple/20 bg-brand-purple/10 px-3 py-1.5 font-mono text-xs text-brand-purple"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right: features */}
              <div className="space-y-6">
                {service.features.map((feature) => (
                  <div
                    key={feature.title}
                    className="card rounded-xl border border-brand-border p-5"
                  >
                    <h3 className="font-display text-sm font-semibold mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-brand-text-muted leading-relaxed">
                      {feature.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="section-padding text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-2xl font-bold md:text-3xl mb-4">
            Not sure which service fits?
          </h2>
          <p className="text-brand-text-secondary mb-8">
            Tell us what you&apos;re trying to solve. We&apos;ll recommend the right
            approach — and if we&apos;re not the right fit, we&apos;ll tell you that too.
          </p>
          <Link
            href="/contact"
            className="inline-block btn-primary px-8 py-4 text-sm font-medium text-white transition-all duration-300"
          >
            Let&apos;s Talk &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
