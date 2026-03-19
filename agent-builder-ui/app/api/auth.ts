import api from "@/services/axios";
import { APIError } from "@/shared/interfaces";
import { clearAuthCookies, setAuthCookies } from "@/services/authCookies";
import { useUserStore } from "@/hooks/use-user";

// ==========================================
// Auth API Interfaces
// ==========================================

/**
 * Response from token refresh API
 */
export interface TokenResponse {
  success: boolean;
  access_token: string;
  token_type: string;
  tokenExpireAt: string;
}

export const authApi = {
  /**
   * Logout user
   * Calls backend logout endpoint and clears local session data
   */
  logout: async (): Promise<void> => {
    try {
      // Call backend logout endpoint
      await api.post("/auth/logout");

      // Clear auth cookies
      await clearAuthCookies();
      // Clear user store
      useUserStore.getState().clearUser("auth api logout");
    } catch (error: unknown) {
      const axiosError = error as APIError;
      // Even if there's an error, try to clear the user store
      useUserStore.getState().clearUser("auth api logout catch");
      throw new Error(axiosError.response?.data?.message || "Logout failed");
    }
  },

  /**
   * Generate new access token using refresh token
   * @param refreshToken The refresh token to use for generating a new access token
   */
  generateAccessToken: async (
    refreshToken: string
  ): Promise<TokenResponse> => {
    try {
      const response = await api.post<TokenResponse>(
        "/auth/access-token",
        {},
        {
          params: { refresh_token: refreshToken },
        }
      );

      // Update the access token in cookies if successful
      if (response.data.success && response.data.access_token) {
        // Calculate token age in seconds from tokenExpireAt
        const expireAt = new Date(
          Number(response.data.tokenExpireAt) * 1000
        ).getTime();
        const now = new Date().getTime();
        const accessTokenAge = Math.floor((expireAt - now) / 1000);
        await setAuthCookies(
          response.data.access_token,
          refreshToken,
          accessTokenAge > 0 ? accessTokenAge : 3600, // Default to 1 hour if calculation is negative
          null // Don't update refresh token age
        );

        // Also update the access token in the user store
        const currentUser = useUserStore.getState().user;
        if (currentUser) {
          useUserStore.getState().setUser({
            ...currentUser,
            accessToken: response.data.access_token,
          });
        }
      }

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as APIError;
      throw new Error(
        axiosError.response?.data?.detail ||
          axiosError.response?.data?.message ||
          "Failed to generate new access token"
      );
    }
  },
};
