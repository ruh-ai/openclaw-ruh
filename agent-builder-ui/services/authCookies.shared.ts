const cookieDomain = process.env.NEXT_PUBLIC_COOKIES_DOMAIN;
const isDev = process.env.NODE_ENV === "development";

export function buildAuthCookieOptions({ maxAge }: { maxAge: number }) {
  return {
    path: "/",
    domain: cookieDomain,
    httpOnly: false,
    sameSite: isDev ? ("lax" as const) : ("none" as const),
    secure: !isDev,
    maxAge,
  };
}

export function buildClearedAuthCookieOptions() {
  return {
    ...buildAuthCookieOptions({ maxAge: 0 }),
    expires: new Date(0),
  };
}
