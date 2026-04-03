"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { assertCustomerAppAccess } from "@/lib/auth/app-access";
import {
  ensureCustomerSurfaceSession,
  type CustomerSessionMembership,
} from "@/lib/auth/customer-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CustomerLoginSession {
  appAccess?: {
    admin: boolean;
    builder: boolean;
    customer: boolean;
  } | null;
  memberships?: CustomerSessionMembership[];
  activeOrganization?: {
    id: string;
    slug: string;
    kind: string;
  } | null;
  message?: string;
}

function isSafeRedirectUrl(url: string): boolean {
  if (!url || !url.startsWith("/")) return false;
  // Block protocol-relative URLs (//evil.com) and backslash tricks
  if (url.startsWith("//") || url.startsWith("/\\")) return false;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.host === "localhost";
  } catch {
    return false;
  }
}

export default function CustomerLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect_url") || "/";
  const redirectUrl = isSafeRedirectUrl(rawRedirect) ? rawRedirect : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchOrganization = async (
    organizationId: string
  ): Promise<CustomerLoginSession> => {
    const response = await fetch(`${API_URL}/api/auth/switch-org`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ organizationId }),
    });
    const data = (await response.json()) as CustomerLoginSession;

    if (!response.ok) {
      throw new Error(data.message || "Customer organization access required");
    }

    return data;
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as CustomerLoginSession;

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      const session = await ensureCustomerSurfaceSession(
        data,
        switchOrganization
      );
      assertCustomerAppAccess(session);
      router.push(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9f7f9] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-violet-700">Ruh Workspace</h1>
          <p className="text-sm text-gray-500 mt-1">Customer organization access</p>
        </div>
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm"
        >
          {error ? (
            <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg border border-red-200">
              {error}
            </div>
          ) : null}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white outline-none focus:border-violet-500 transition-colors"
              placeholder="admin@globex.test"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white outline-none focus:border-violet-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-bold text-white bg-violet-700 rounded-lg hover:bg-violet-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
