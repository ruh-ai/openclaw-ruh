"use client";

import { useEffect, useState, ReactNode, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/hooks/use-user";
import { userApi } from "@/app/api/user";
import { getAccessToken, getRefreshToken } from "@/services/authCookies";
import Image from "next/image";
import { ruhLogoGif } from "@/shared/constants";

interface SessionInitializerProps {
  children: ReactNode;
}

function SessionInitializerContent({ children }: SessionInitializerProps) {
  const { user, setUser, clearUser } = useUserStore();
  const [shouldFetchData, setShouldFetchData] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

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

    const checkToken = async () => {
      try {
        const currentToken = await getAccessToken();
        const refreshToken = await getRefreshToken();

        if (!currentToken && !refreshToken) {
          setIsInitialized(true);
          return;
        }

        const storedToken = user?.accessToken;

        // Only fetch if token changed, no stored token, or missing user data
        if (storedToken !== currentToken || !user) {
          setShouldFetchData(true);
        } else {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error("Token check error:", error);
        clearUser("checkToken catch");
        setIsInitialized(true);
      }
    };

    checkToken();
  }, [isHydrated, user, clearUser]);

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
      const updateUserWithToken = async () => {
        try {
          const currentToken = await getAccessToken();
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
            accessToken: currentToken || "",
          });
        } catch (error) {
          console.error("Error getting access token for user store:", error);
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
      setShouldFetchData(false);
      setIsInitialized(true);
    }
  }, [userError, clearUser]);

  // Stop fetching when user query completes
  useEffect(() => {
    if (shouldFetchData && !isUserLoading) {
      setShouldFetchData(false);
      setIsInitialized(true);
    }
  }, [shouldFetchData, isUserLoading]);

  // Show loading spinner until hydration and initialization are complete
  if (!isHydrated || !isInitialized || (shouldFetchData && isUserLoading)) {
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
