import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginRoute, dashboardRoute } from "@/shared/routes";

// Auth routes that should be accessible without tokens
const publicRoutes = [loginRoute];

export function middleware(request: NextRequest) {
  // TODO: Re-enable auth check after testing
  return NextResponse.next();

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
    const loginUrl = new URL(loginRoute, request.url);
    if (pathname !== dashboardRoute) {
      const originalUrl = request.nextUrl.pathname + request.nextUrl.search;
      loginUrl.searchParams.set("redirect_url", originalUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Configure middleware to run on all routes except api, _next/static, etc.
export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\.[\\w]+$).*)"],
};
