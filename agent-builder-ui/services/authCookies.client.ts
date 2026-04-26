/**
 * Client-side cookie utilities for reading and clearing auth tokens.
 *
 * The server-side authCookies.ts uses Next.js `cookies()` (server actions).
 * Importing server actions in client code turns every call into an RPC
 * round-trip that can hang the axios interceptor and block login.
 *
 * Since auth cookies are NOT httpOnly, we read/clear them directly from
 * `document.cookie` on the client.
 */

import {
  buildAuthCookieOptions,
  buildClearedAuthCookieOptions,
} from "./authCookies.shared";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function setCookie(
  name: string,
  value: string,
  options: ReturnType<typeof buildAuthCookieOptions>
) {
  if (typeof document === "undefined") return;
  let cookie = `${name}=${encodeURIComponent(value)}; path=${options.path}`;
  if (options.domain) cookie += `; domain=${options.domain}`;
  if (options.secure) cookie += "; secure";
  if (options.sameSite) cookie += `; samesite=${options.sameSite}`;
  if (options.maxAge != null) cookie += `; max-age=${options.maxAge}`;
  document.cookie = cookie;
}

export function getAccessToken(): string | null {
  return getCookie("accessToken");
}

export function getRefreshToken(): string | null {
  return getCookie("refreshToken");
}

export function setAuthCookies(
  accessToken: string,
  refreshToken: string | null,
  accessTokenAge: number,
  refreshTokenAge: number | null
): void {
  setCookie(
    "accessToken",
    accessToken,
    buildAuthCookieOptions({ maxAge: accessTokenAge })
  );
  if (refreshToken && refreshTokenAge) {
    setCookie(
      "refreshToken",
      refreshToken,
      buildAuthCookieOptions({ maxAge: refreshTokenAge })
    );
  }
}

export function clearAuthCookies(): void {
  const cleared = buildClearedAuthCookieOptions();
  setCookie("accessToken", "", cleared);
  setCookie("refreshToken", "", cleared);
}
