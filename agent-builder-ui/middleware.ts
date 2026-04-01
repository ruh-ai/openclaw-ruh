import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginRoute } from "@/shared/routes";
import { getAuthRedirectPath } from "@/lib/auth/session-guard";

// Auth routes that should be accessible without tokens
const publicRoutes = [loginRoute];

export function middleware(request: NextRequest) {
  // Bypass auth entirely in local development
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  const hasAuthTokens =
    request.cookies.has("accessToken") || request.cookies.has("refreshToken");

  if (!hasAuthTokens) {
    const redirectPath = getAuthRedirectPath({
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    });
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

// Configure middleware to run on all routes except api, _next/static, etc.
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\.[\\w]+$).*)"],
};
