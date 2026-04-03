"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Bot, Store, Activity, LogOut } from "lucide-react";
import { AdminSessionGate } from "@/app/_components/AdminSessionGate";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/system", label: "System", icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminSessionGate>
      <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-[var(--card-color)] border-r border-[var(--border-default)] flex flex-col" role="complementary" aria-label="Admin navigation">
        <div className="px-5 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-sm font-bold text-[var(--primary)]">Ruh Admin</h2>
          <p className="text-[10px] text-[var(--text-tertiary)]">Platform Management</p>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5" aria-label="Main navigation">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-[var(--border-default)]">
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
            aria-label="Sign out of admin panel"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--error)]/5 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[var(--bg-default)]" role="main">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {children}
        </div>
      </main>
      </div>
    </AdminSessionGate>
  );
}
