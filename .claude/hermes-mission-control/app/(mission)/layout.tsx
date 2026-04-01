"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Brain,
  ListTodo,
  GitBranch,
  Sparkles,
  Clock,
  Layers,
  Timer,
  Target,
  Sliders,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/goals", label: "Goals", icon: Target },
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

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-[var(--sidebar-bg)] border-r border-[var(--border-default)] flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg soul-pulse flex items-center justify-center bg-[var(--primary)]/10">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--primary)]">Hermes</h2>
              <p className="text-[10px] text-[var(--text-tertiary)]">Mission Control</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-default)]">
          <p className="text-[10px] text-[var(--text-tertiary)]">openclaw-ruh-enterprise</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Self-evolving orchestrator</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header bar with gradient drift */}
        <div className="gradient-drift h-1" />
        <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
