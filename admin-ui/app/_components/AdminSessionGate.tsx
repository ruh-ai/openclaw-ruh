"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { assertAdminAppAccess } from "@/lib/auth/app-access";

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

interface AdminSessionResponse {
  id: string;
  email: string;
  displayName: string;
  platformRole?: "platform_admin" | "user";
  appAccess?: {
    admin: boolean;
    builder: boolean;
    customer: boolean;
  } | null;
}

export function AdminSessionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const redirectUrl = useMemo(() => {
    const safePath = isSafeRedirectPath(pathname || "/dashboard") ? (pathname || "/dashboard") : "/dashboard";
    const params = new URLSearchParams();
    params.set("redirect_url", safePath);
    return `/login?${params.toString()}`;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Session bootstrap failed with ${response.status}`);
        }

        const data = (await response.json()) as AdminSessionResponse;
        assertAdminAppAccess(data);

        if (!cancelled) {
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
  }, [redirectUrl, router]);

  if (status !== "ready") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
