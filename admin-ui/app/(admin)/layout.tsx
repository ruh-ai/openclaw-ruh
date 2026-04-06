"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Boxes,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Store,
  Users,
  Waypoints,
} from "lucide-react";

import { AdminSessionGate } from "@/app/_components/AdminSessionGate";
import { API_URL } from "@/lib/admin-api";

const NAV_SECTIONS = [
  {
    label: "Command",
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Business",
    items: [
      { href: "/users", label: "People", icon: Users },
      { href: "/organizations", label: "Organizations", icon: Boxes },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/runtime", label: "Runtime", icon: Waypoints },
      { href: "/audit", label: "Audit", icon: ScrollText },
      { href: "/system", label: "System", icon: Activity },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminSessionGate>
      <div className="flex min-h-screen bg-[var(--bg-default)]">
        <aside className="sticky top-0 flex h-screen w-[92px] shrink-0 px-2 py-3 sm:w-64 sm:px-4 sm:py-5 xl:w-72 xl:px-5 xl:py-6">
          <div
            className="flex h-full flex-col rounded-[32px] border border-white/10 px-5 py-6 shadow-[var(--panel-shadow-strong)]"
            style={{ background: "var(--sidebar-bg)" }}
          >
            <div className="rounded-[28px] border border-white/14 bg-[rgba(255,255,255,0.12)] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur sm:p-5 sm:text-left">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 text-lg font-semibold text-white">
                R
              </div>
              <p className="mt-4 hidden text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--sidebar-text-muted)] sm:block">
                Ruh.ai
              </p>
              <h2 className="font-display mt-3 hidden text-3xl font-semibold tracking-[-0.04em] text-white sm:block">
                Super Admin
              </h2>
              <p className="mt-3 hidden text-sm leading-6 text-[var(--sidebar-text)] xl:block">
                Control platform health, tenant access, runtime drift, and marketplace momentum from one branded operator surface.
              </p>
            </div>

            <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
              {NAV_SECTIONS.map((section) => (
                <div key={section.label}>
                  <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sidebar-text-muted)] xl:block">
                    {section.label}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname.startsWith(item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center justify-center gap-3 rounded-[20px] px-3 py-3 text-sm font-medium transition-colors sm:justify-start ${
                            active
                              ? "bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
                              : "text-[var(--sidebar-text)] hover:bg-white/12 hover:text-white"
                          }`}
                          title={item.label}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="hidden sm:inline">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <button
              onClick={async () => {
                try {
                  await fetch(`${API_URL}/api/auth/logout`, {
                    method: "POST",
                    credentials: "include",
                  });
                } finally {
                  window.location.href = "/login";
                }
              }}
              className="inline-flex items-center justify-center gap-3 rounded-[20px] border border-white/14 bg-white/12 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/18 sm:justify-start"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </AdminSessionGate>
  );
}
