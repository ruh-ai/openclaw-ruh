"use server";

import { cookies } from "next/headers";

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
  cookieStore.set("accessToken", accessToken, {
    path: "/",
    domain: process.env.NEXT_PUBLIC_COOKIES_DOMAIN,
    httpOnly: false,
    sameSite: "none",
    secure: true,
    maxAge: accessTokenAge,
  });

  if (refreshToken && refreshTokenAge) {
    cookieStore.set("refreshToken", refreshToken, {
      path: "/",
      domain: process.env.NEXT_PUBLIC_COOKIES_DOMAIN,
      httpOnly: false,
      sameSite: "none",
      secure: true,
      maxAge: refreshTokenAge,
    });
  }
};

export const clearAuthCookies = async () => {
  "use server";

  const cookieStore = await cookies();
  cookieStore.set("accessToken", "", {
    path: "/",
    domain: process.env.NEXT_PUBLIC_COOKIES_DOMAIN,
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
    expires: new Date(0),
  });

  cookieStore.set("refreshToken", "", {
    path: "/",
    domain: process.env.NEXT_PUBLIC_COOKIES_DOMAIN,
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
    expires: new Date(0),
  });
};
