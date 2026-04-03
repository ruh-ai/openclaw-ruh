"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { assertCustomerAppAccess } from "@/lib/auth/app-access";
import {
  ensureCustomerSurfaceSession,
  getEligibleCustomerMemberships,
  type CustomerSessionMembership,
} from "@/lib/auth/customer-session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function isSafeRedirectPath(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  try {
    const parsed = new URL(path, "http://localhost");
    return parsed.host === "localhost";
  } catch {
    return false;
  }
}

interface CustomerSessionResponse {
  id: string;
  email: string;
  displayName: string;
  platformRole?: "platform_admin" | "user";
  appAccess?: {
    admin: boolean;
    builder: boolean;
    customer: boolean;
  } | null;
  memberships?: CustomerSessionMembership[];
  activeOrganization?: {
    id: string;
    name: string;
    slug: string;
    kind: "developer" | "customer";
    plan: string;
  } | null;
}

export function CustomerSessionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [session, setSession] = useState<CustomerSessionResponse | null>(null);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<
    string | null
  >(null);
  const isLoginRoute = pathname?.startsWith("/login");
  const redirectUrl = useMemo(() => {
    const safePath = isSafeRedirectPath(pathname || "/") ? (pathname || "/") : "/";
    const params = new URLSearchParams();
    params.set("redirect_url", safePath);
    return `/login?${params.toString()}`;
  }, [pathname]);
  const customerMemberships = useMemo(
    () => getEligibleCustomerMemberships(session),
    [session]
  );

  const switchOrganization = async (
    organizationId: string
  ): Promise<CustomerSessionResponse> => {
    const response = await fetch(`${API_URL}/api/auth/switch-org`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ organizationId }),
    });
    const data = (await response.json()) as CustomerSessionResponse;
    if (!response.ok) {
      throw new Error("Customer organization access required");
    }
    return data;
  };

  useEffect(() => {
    if (isLoginRoute) {
      setStatus("ready");
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Session bootstrap failed with ${response.status}`);
        }

        const data = (await response.json()) as CustomerSessionResponse;
        const nextSession = await ensureCustomerSurfaceSession(
          data,
          switchOrganization
        );
        assertCustomerAppAccess(nextSession);

        if (!cancelled) {
          setSession(nextSession);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          router.replace(redirectUrl);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [isLoginRoute, redirectUrl, router]);

  if (status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {!isLoginRoute && customerMemberships.length > 1 ? (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            Active Organization
          </label>
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 outline-none"
            value={session?.activeOrganization?.id ?? ""}
            disabled={switchingOrganizationId !== null}
            onChange={async (event) => {
              const organizationId = event.target.value;
              if (!organizationId || organizationId === session?.activeOrganization?.id) {
                return;
              }

              setSwitchingOrganizationId(organizationId);
              try {
                const nextSession = await switchOrganization(organizationId);
                assertCustomerAppAccess(nextSession);
                setSession(nextSession);
                router.refresh();
              } finally {
                setSwitchingOrganizationId(null);
              }
            }}
          >
            {customerMemberships.map((membership) => (
              <option
                key={membership.organizationId}
                value={membership.organizationId}
              >
                {membership.organizationName ??
                  membership.organizationSlug ??
                  membership.organizationId}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {children}
    </>
  );
}
