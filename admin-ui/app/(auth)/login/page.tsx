"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import { assertAdminAppAccess } from "@/lib/auth/app-access";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      assertAdminAppAccess({
        appAccess: data.appAccess ?? {
          admin: data.user.role === "admin",
          builder: false,
          customer: false,
        },
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg-default)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[12%] h-52 w-52 rounded-full bg-[var(--accent-primary-soft)] blur-3xl" />
        <div className="absolute bottom-[8%] right-[10%] h-64 w-64 rounded-full bg-[var(--accent-secondary-soft)] blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-[rgba(255,255,255,0.24)] bg-[linear-gradient(180deg,rgba(18,25,94,0.96),rgba(94,29,171,0.94))] p-8 text-white shadow-[var(--panel-shadow-strong)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/78">
            <Sparkles className="h-3.5 w-3.5" />
            Ruh platform control plane
          </div>
          <h1 className="font-display mt-6 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            Operate the platform with the same voice as the builder.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/76 md:text-base">
            Review runtime drift, moderate the marketplace, manage people and organizations, and investigate audit trails from one branded operator surface.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-white/12 bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">Runtime and compliance</p>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Restart sandboxes, retrofit shared Codex, inspect request-linked audit events, and repair drift without leaving admin.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/12 bg-white/10 p-4">
              <p className="text-sm font-semibold text-white">Business operations</p>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Moderate listings, manage organization plans, inspect ownership, and act on account state directly from the control plane.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-[32px] border border-[var(--border-default)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,244,251,0.94))] p-6 shadow-[var(--panel-shadow)] backdrop-blur sm:p-8"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-primary)]">
            <ShieldCheck className="h-4 w-4" />
            Super admin access
          </div>
          <h2 className="font-display mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Sign in to Ruh Admin
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Use a platform-admin account to access control-plane actions and system-level visibility.
          </p>

          {error ? (
            <div className="mt-6 rounded-[20px] border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-[18px] border border-[var(--border-default)] bg-white px-4 py-3 text-sm outline-none"
                placeholder="admin@ruh.ai"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-[18px] border border-[var(--border-default)] bg-white px-4 py-3 text-sm outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(123,90,255,0.28)] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Enter control plane"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
