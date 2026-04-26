"use client";

import { useEffect, useMemo, useRef, useState, ReactNode, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/hooks/use-user";
import { userApi } from "@/app/api/user";
import { getAccessToken, getRefreshToken } from "@/services/authCookies.client";
import Image from "next/image";
import { ruhLogoGif } from "@/shared/constants";
import { resolveSessionGateDecision, type SessionBootstrapStatus } from "@/lib/auth/session-guard";

interface SessionInitializerProps {
  children: ReactNode;
}

function SessionInitializerContent({ children }: SessionInitializerProps) {
  return <SessionInitializerContentInner>{children}</SessionInitializerContentInner>;
}

function SessionInitializerContentInner({ children }: SessionInitializerProps) {
  const { user, setUser, clearUser } = useUserStore();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [shouldFetchData, setShouldFetchData] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<SessionBootstrapStatus>("idle");
  const [bootstrapErrorStatus, setBootstrapErrorStatus] = useState<number>();
  // Guard: once a fetch has been attempted and failed, don't re-trigger.
  // Without this, clearUser() sets user=null → effect re-fires → sees !user →
  // sets shouldFetchData(true) → query fails → clearUser() → infinite loop.
  const [fetchAttempted, setFetchAttempted] = useState(false);

  // Wait for Zustand stores to hydrate from localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsHydrated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Check token after hydration is complete
  useEffect(() => {
    if (!isHydrated) return;

    const checkToken = () => {
      try {
        const currentToken = getAccessToken();
        const refreshToken = getRefreshToken();
        const hasCurrentToken = Boolean(currentToken);
        const hasCurrentRefreshToken = Boolean(refreshToken);

        setHasAccessToken(hasCurrentToken);
        setHasRefreshToken(hasCurrentRefreshToken);

        if (!hasCurrentToken && !hasCurrentRefreshToken) {
          setBootstrapStatus("idle");
          setShouldFetchData(false);
          return;
        }

        const storedToken = user?.accessToken;

        // Only fetch if token changed, no stored token, or missing user data.
        // But never re-fetch after a failed attempt — that causes an infinite
        // clearUser → re-fire → fetch → fail → clearUser loop.
        if ((storedToken !== currentToken || !user) && !fetchAttempted) {
          setBootstrapStatus("loading");
          setShouldFetchData(true);
          setFetchAttempted(true);
        } else if (user && storedToken === currentToken) {
          setBootstrapStatus("success");
          setShouldFetchData(false);
        }
      } catch (error) {
        console.error("Token check error:", error);
        clearUser("checkToken catch");
        setHasAccessToken(false);
        setHasRefreshToken(false);
        setBootstrapStatus("auth_error");
        setShouldFetchData(false);
      }
    };

    checkToken();
  }, [isHydrated, user, clearUser, fetchAttempted]);

  // React Query for user data
  const {
    data: userData,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery({
    queryKey: ["currentUser"],
    queryFn: userApi.getCurrentUser,
    enabled: shouldFetchData,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Update store when data is fetched
  useEffect(() => {
    if (userData && shouldFetchData) {
      const updateUserWithToken = () => {
        try {
          const currentToken = getAccessToken();
          setUser({
            id: userData.id,
            fullName: userData.fullName,
            email: userData.email,
            company: userData.company,
            department: userData.department,
            jobRole: userData.jobRole,
            phoneNumber: userData.phoneNumber,
            profileImage: userData.profileImage,
            isFirstLogin: userData.isFirstLogin,
            activeOrganization: userData.activeOrganization ?? null,
            activeMembership: userData.activeMembership ?? null,
            memberships: userData.memberships ?? [],
            platformRole: userData.platformRole ?? "user",
            appAccess: userData.appAccess ?? null,
            accessToken: currentToken || "",
          });
          setBootstrapErrorStatus(undefined);
          setBootstrapStatus("success");
        } catch (error) {
          console.error("Error getting access token for user store:", error);
          setBootstrapStatus("success");
        }
      };
      updateUserWithToken();
    }
  }, [userData, shouldFetchData, setUser]);

  // Handle errors
  useEffect(() => {
    if (userError) {
      console.error("Session initialization error:", userError);
      clearUser("Session initialization error");
      const status =
        typeof userError === "object" &&
        userError !== null &&
        "response" in userError &&
        typeof (userError as { response?: { status?: number } }).response?.status === "number"
          ? (userError as { response?: { status?: number } }).response?.status
          : undefined;
      setBootstrapErrorStatus(status);
      setBootstrapStatus(
        status === 401 || status === 403 ? "auth_error" : "error"
      );
      setShouldFetchData(false);
    }
  }, [userError, clearUser]);

  // Stop fetching when user query completes
  useEffect(() => {
    if (shouldFetchData && !isUserLoading) {
      setShouldFetchData(false);
    }
  }, [shouldFetchData, isUserLoading]);

  const hasUser = Boolean(user);
  const searchString = searchParams.toString();
  const decision = useMemo(
    () =>
      resolveSessionGateDecision({
        pathname,
        search: searchString ? `?${searchString}` : "",
        hasAccessToken,
        hasRefreshToken,
        hasUser,
        bootstrapStatus,
        bootstrapErrorStatus,
      }),
    [pathname, searchString, hasAccessToken, hasRefreshToken, hasUser, bootstrapStatus, bootstrapErrorStatus],
  );

  // Track whether clearUser has already been called for this decision to
  // prevent the infinite loop: clearUser → user=null → re-render → new
  // decision object → clearUser again.
  const clearedForDecisionRef = useRef(false);

  useEffect(() => {
    // Wait for hydration before acting on the gate decision. On the very first
    // render, hasAccessToken/hasRefreshToken are still their initial `false`
    // defaults (they're populated by checkToken AFTER isHydrated flips true).
    // Acting here before hydration would produce a false "no cookies" verdict
    // and redirect to /authenticate even when valid cookies exist — a full
    // login-loop bug.
    if (!isHydrated) return;

    if (decision.clearUser && !clearedForDecisionRef.current) {
      clearedForDecisionRef.current = true;
      clearUser("session gate decision");
    }

    if (!decision.clearUser) {
      clearedForDecisionRef.current = false;
    }

    if (decision.type === "redirect") {
      router.replace(decision.href);
    }
  }, [clearUser, decision, router, isHydrated]);

  // Show loading spinner until hydration and initialization are complete
  if (
    !isHydrated ||
    decision.type === "pending" ||
    decision.type === "redirect" ||
    (shouldFetchData && isUserLoading)
  ) {
    return (
      <div className="flex h-screen flex-1 items-center justify-center">
        <Image src={ruhLogoGif} alt="Loading..." width={80} height={80} />
      </div>
    );
  }

  return <>{children}</>;
}

export function SessionInitializationWrapper({
  children,
}: SessionInitializerProps) {
  return (
    <Suspense fallback={<>{children}</>}>
      <SessionInitializerContent>{children}</SessionInitializerContent>
    </Suspense>
  );
}
