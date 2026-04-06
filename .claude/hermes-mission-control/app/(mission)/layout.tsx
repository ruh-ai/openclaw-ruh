"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  Brain,
  Clock,
  GitBranch,
  LayoutDashboard,
  Layers,
  ListTodo,
  Sliders,
  Sparkle,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/goals", label: "Goals Board", icon: Target },
  { href: "/queue", label: "Queue", icon: Layers },
  { href: "/schedules", label: "Schedules", icon: Timer },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/sessions", label: "Sessions", icon: Clock },
  { href: "/evolution", label: "Evolution", icon: GitBranch },
  { href: "/pool", label: "Worker Pool", icon: Sliders },
];

export default function MissionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeItem = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <div className="mission-shell relative min-h-screen overflow-hidden">
      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden xl:flex w-72 shrink-0 flex-col border-r border-[var(--border-default)]/70 bg-[rgba(253,251,255,0.78)] px-5 py-6 backdrop-blur-2xl">
          <div className="mission-card-dark rounded-[28px] p-5 text-[var(--text-white)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 soul-pulse">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="section-label text-white/60">Orchestrator</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Hermes</h2>
                  <p className="mt-1 text-sm text-white/70">Mission Control</p>
                </div>
              </div>
              <Sparkle className="mt-1 h-4 w-4 text-white/70" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-white/55">Mode</p>
                <p className="mt-1 font-medium text-white">Autonomous</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-white/55">Surface</p>
                <p className="mt-1 font-medium text-white">Operator-first</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <p className="section-label px-3">Control Surface</p>
            <nav className="mt-3 space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(item.href + "/");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-all ${
                      active
                        ? "mission-card text-[var(--text-primary)] shadow-[0_10px_30px_rgba(123,90,255,0.18)]"
                        : "text-[var(--text-secondary)] hover:bg-white/50 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                      active ? "bg-[var(--primary)]/12 text-[var(--primary)]" : "bg-white/55 text-[var(--text-tertiary)] group-hover:text-[var(--primary)]"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {active && <ArrowUpRight className="h-4 w-4 text-[var(--primary)]" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mission-card mt-auto rounded-[24px] p-4">
            <p className="section-label">Workspace</p>
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">openclaw-ruh-enterprise</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              The dashboard should tell you when Hermes is thriving, when it is blocked, and which goal lane needs intervention.
            </p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="gradient-drift h-1.5" />
          <div className="mx-auto flex w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 sm:py-7">
            <div className="mission-card mb-6 flex flex-col gap-4 rounded-[28px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="section-label">Control Layer</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {activeItem?.label || "Mission Control"}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Autonomous queue operations, live goal pressure, and evolving specialist performance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[var(--border-default)] bg-white/55 px-3 py-1.5 text-[var(--text-secondary)]">
                  Self-evolving orchestration
                </span>
                <span className="rounded-full border border-[var(--border-default)] bg-white/55 px-3 py-1.5 text-[var(--text-secondary)]">
                  Goal-driven execution
                </span>
              </div>
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
