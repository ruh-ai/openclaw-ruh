"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListTodo,
  FileText,
  Calendar,
  Monitor,
  Settings,
  Activity,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/live", label: "Live View", icon: Monitor },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({
  agentName,
  agentAvatar,
  children,
}: {
  agentName?: string;
  agentAvatar?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] flex flex-col">
        {/* Agent identity */}
        <div className="px-4 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-sm font-bold">
              {agentAvatar || agentName?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {agentName || "Agent"}
              </p>
              <div className="flex items-center gap-1">
                <Activity className="h-2.5 w-2.5 text-[var(--success)]" />
                <span className="text-[10px] text-[var(--success)] font-medium">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname === ""
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--primary-light)] text-[var(--primary)] font-semibold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
          <p className="text-[10px] text-[var(--text-tertiary)]">Agent Runtime v0.1</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
