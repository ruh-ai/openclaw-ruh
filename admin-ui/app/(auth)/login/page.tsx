"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-default)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--primary)]">Ruh Admin</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Platform Administration</p>
        </div>
        <form onSubmit={handleLogin} className="bg-[var(--card-color)] rounded-2xl border border-[var(--border-default)] p-6 space-y-4 shadow-sm">
          {error && (
            <div className="px-3 py-2 text-xs text-[var(--error)] bg-[var(--error)]/10 rounded-lg border border-[var(--error)]/20">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--bg-default)] outline-none focus:border-[var(--primary)] transition-colors"
              placeholder="admin@ruh.ai"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--bg-default)] outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
