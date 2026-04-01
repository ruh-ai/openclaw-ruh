import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login"];

function getLoginRedirectPath(pathname: string, search: string): string {
  const params = new URLSearchParams();
  params.set("redirect_url", `${pathname}${search}`);
  return `/login?${params.toString()}`;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  if (isPublicRoute) {
    return NextResponse.next();
  }

  const hasAuthTokens =
    request.cookies.has("accessToken") || request.cookies.has("refreshToken");

  if (!hasAuthTokens) {
    return NextResponse.redirect(
      new URL(
        getLoginRedirectPath(request.nextUrl.pathname, request.nextUrl.search),
        request.url
      )
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\.[\\w]+$).*)"],
};
