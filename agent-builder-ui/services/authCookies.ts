"use server";

import { cookies } from "next/headers";
import {
  buildAuthCookieOptions,
  buildClearedAuthCookieOptions,
} from "./authCookies.shared";

export const getAccessToken = async () => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken");
  return accessToken?.value || null;
};

export const getRefreshToken = async () => {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refreshToken");
  return refreshToken?.value || null;
};

export const checkAccessToken = async () => {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("accessToken");
  return Boolean(tokenCookie?.value);
};

export const setAuthCookies = async (
  accessToken: string,
  refreshToken: string | null,
  accessTokenAge: number,
  refreshTokenAge: number | null
) => {
  const cookieStore = await cookies();
  cookieStore.set(
    "accessToken",
    accessToken,
    buildAuthCookieOptions({ maxAge: accessTokenAge })
  );

  if (refreshToken && refreshTokenAge) {
    cookieStore.set(
      "refreshToken",
      refreshToken,
      buildAuthCookieOptions({ maxAge: refreshTokenAge })
    );
  }
};

export const clearAuthCookies = async () => {
  "use server";

  const cookieStore = await cookies();
  const clearedOptions = buildClearedAuthCookieOptions();
  cookieStore.set("accessToken", "", clearedOptions);
  cookieStore.set("refreshToken", "", clearedOptions);
};
