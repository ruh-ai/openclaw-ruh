const cookieDomain = process.env.NEXT_PUBLIC_COOKIES_DOMAIN;

export function buildAuthCookieOptions({ maxAge }: { maxAge: number }) {
  return {
    path: "/",
    domain: cookieDomain,
    httpOnly: false,
    sameSite: "none" as const,
    secure: true,
    maxAge,
  };
}

export function buildClearedAuthCookieOptions() {
  return {
    ...buildAuthCookieOptions({ maxAge: 0 }),
    expires: new Date(0),
  };
}
