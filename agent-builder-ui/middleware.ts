import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginRoute, dashboardRoute } from "@/shared/routes";

// Auth routes that should be accessible without login
const publicRoutes = [loginRoute];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Simple cookie-based auth check
  const isAuthenticated = request.cookies.has("agent-builder-auth");

  // If on login page and already authenticated, redirect to dashboard
  if (isPublicRoute && isAuthenticated) {
    return NextResponse.redirect(new URL(dashboardRoute, request.url));
  }

  // If on protected route and not authenticated, redirect to login
  if (!isPublicRoute && !isAuthenticated) {
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

/*
 * ========================================
 * ORIGINAL AUTH MIDDLEWARE (commented out)
 * Used accessToken/refreshToken cookies from external auth service
 * ========================================
 *
 * export function middleware(request: NextRequest) {
 *   const pathname = request.nextUrl.pathname;
 *   const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
 *   if (isPublicRoute) return NextResponse.next();
 *
 *   const hasAuthTokens =
 *     request.cookies.has("accessToken") || request.cookies.has("refreshToken");
 *
 *   if (!hasAuthTokens) {
 *     const loginUrl = new URL(loginRoute, request.url);
 *     if (pathname !== dashboardRoute) {
 *       const originalUrl = request.nextUrl.pathname + request.nextUrl.search;
 *       loginUrl.searchParams.set("redirect_url", originalUrl);
 *     }
 *     return NextResponse.redirect(loginUrl);
 *   }
 *
 *   return NextResponse.next();
 * }
 */
