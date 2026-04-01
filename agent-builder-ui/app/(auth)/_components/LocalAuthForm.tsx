"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/app/api/auth";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function LocalAuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTarget = useMemo(
    () => searchParams.get("redirect_url") || "/agents",
    [searchParams]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await authApi.login(email, password);
      } else {
        await authApi.register({
          email,
          password,
          displayName: displayName || email,
          organizationName: organizationName || undefined,
          organizationSlug:
            organizationName && !organizationSlug
              ? slugify(organizationName)
              : organizationSlug || undefined,
          organizationKind: organizationName ? "developer" : undefined,
          membershipRole: organizationName ? "owner" : undefined,
        });
      }

      router.push(redirectTarget);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Authentication failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-secondary-font">
          Local Auth Fallback
        </div>
        <h2 className="mt-2 text-xl font-bold text-brand-primary-font">
          {mode === "login" ? "Sign in locally" : "Create a local test account"}
        </h2>
        <p className="mt-2 text-sm text-brand-secondary-font">
          Testing-only path for local development when no external auth provider is configured.
        </p>
      </div>

      <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 ${mode === "login" ? "bg-white shadow-sm text-brand-primary-font" : "text-brand-secondary-font"}`}
          onClick={() => setMode("login")}
        >
          Login
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 ${mode === "register" ? "bg-white shadow-sm text-brand-primary-font" : "text-brand-secondary-font"}`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-brand-secondary-font">
            Email
          </label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="builder@ruh.ai"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-brand-secondary-font">
            Password
          </label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="SecurePass1!"
            required
          />
        </div>

        {mode === "register" ? (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-secondary-font">
                Display Name
              </label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Builder User"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-brand-secondary-font">
                Developer Organization Name
              </label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary"
                type="text"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                placeholder="Acme Developer Studio"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-brand-secondary-font">
                Organization Slug
              </label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary"
                type="text"
                value={organizationSlug}
                onChange={(event) => setOrganizationSlug(event.target.value)}
                placeholder={organizationName ? slugify(organizationName) : "acme-developer-studio"}
              />
            </div>
          </>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting
            ? mode === "login"
              ? "Signing in..."
              : "Creating account..."
            : mode === "login"
              ? "Sign In"
              : "Create Account"}
        </button>
      </form>
    </div>
  );
}
