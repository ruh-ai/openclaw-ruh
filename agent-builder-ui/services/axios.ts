import axios, { AxiosError, AxiosRequestConfig } from "axios";
import {
  getAccessToken,
  getRefreshToken,
  clearAuthCookies,
} from "./authCookies.client";
import { getAccessTokenRoute } from "@/shared/routes";
import { clearUserStore, clearUserStoreAndLogout, getAuthApi } from "./helper";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Request interceptor to add authorization header
api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["ngrok-skip-browser-warning"] = "true";
    return config;
  },
  (error: unknown) => {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return Promise.reject(
      new Error(`Request interceptor error: ${errorMessage}`)
    );
  }
);

// Response interceptor for handling token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // If the access-token endpoint itself fails, clear everything and redirect
    if (originalRequest.url?.includes(getAccessTokenRoute)) {
      await clearUserStoreAndLogout();
      return Promise.reject(new Error("Invalid or expired refresh token."));
    }

    // Check if the error is due to an expired token (401 or 403)
    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      !originalRequest._retry
    ) {
      // Mark this request as retried to prevent infinite loops
      originalRequest._retry = true;

      try {
        // Get the refresh token
        const refreshToken = getRefreshToken();

        if (!refreshToken) {
          clearAuthCookies();
          clearUserStore();
          return Promise.reject(new Error("No refresh token available"));
        }

        // Get the auth API and generate a new access token
        const authApi = await getAuthApi();
        try {
          const tokenResponse =
            await authApi.generateAccessToken(refreshToken);

          if (tokenResponse.accessToken) {
            // Update the authorization header with the new token
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${tokenResponse.accessToken}`,
            };

            // Retry the original request with the new token
            return api(originalRequest);
          }
        } catch (tokenError: unknown) {
          console.error("Token refresh failed:", tokenError);
          clearAuthCookies();
          clearUserStore();
          return Promise.reject(tokenError);
        }

        clearAuthCookies();
        clearUserStore();
        return Promise.reject(new Error("Token refresh failed"));
      } catch (refreshError) {
        console.error("Error during refresh token process:", refreshError);
        clearAuthCookies();
        clearUserStore();
        return Promise.reject(refreshError);
      }
    }

    // For other errors, just reject the promise
    return Promise.reject(error);
  }
);

export default api;
