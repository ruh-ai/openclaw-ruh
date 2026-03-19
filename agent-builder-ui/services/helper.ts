import { useUserStore } from "@/hooks/use-user";
import { clearAuthCookies } from "./authCookies";
import { loginRoute } from "@/shared/routes";

/**
 * Clears user store, auth cookies, and redirects to login page.
 * Used when token refresh fails or session is invalid.
 */
export const clearUserStoreAndLogout = async () => {
  useUserStore.getState().clearUser("helper clearUserStoreAndLogout");
  await clearAuthCookies();
  // Redirect to login page (client-side only)
  if (typeof window !== "undefined") {
    // Prevent redirect loop if already on login page
    if (window.location.pathname !== loginRoute) {
      window.location.href = loginRoute;
    }
  }
};

/**
 * Clears user store without redirecting.
 * Used for cleanup during token refresh failures.
 */
export const clearUserStore = () => {
  useUserStore.getState().clearUser("helper clearUserStore");
};

/**
 * Import the auth API dynamically to avoid circular dependency
 * (axios → helper → auth → axios)
 */
export const getAuthApi = async () => {
  const { authApi } = await import("@/app/api/auth");
  return authApi;
};
