import { agentsRoute, loginRoute } from "@/shared/routes";

export type SessionBootstrapStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "auth_error";

export interface SessionGateContext {
  pathname: string;
  search: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasUser: boolean;
  bootstrapStatus: SessionBootstrapStatus;
  bootstrapErrorStatus?: number;
}

export type SessionGateDecision =
  | { type: "allow"; clearUser: boolean }
  | { type: "pending"; clearUser: boolean }
  | { type: "redirect"; href: string; clearUser: boolean };

function isAuthRoute(pathname: string): boolean {
  return pathname.startsWith(loginRoute);
}

function hasSessionCookies(context: SessionGateContext): boolean {
  return context.hasAccessToken || context.hasRefreshToken;
}

function normalizeBootstrapStatus(
  status: SessionBootstrapStatus,
  errorStatus?: number
): SessionBootstrapStatus {
  if (status === "error" && (errorStatus === 401 || errorStatus === 403)) {
    return "auth_error";
  }
  return status;
}

export function getAuthRedirectPath({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}): string {
  const loginSearch = new URLSearchParams();
  const target = `${pathname}${search}`;
  loginSearch.set("redirect_url", target);
  return `${loginRoute}?${loginSearch.toString()}`;
}

function getRequestedRedirect(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const redirectUrl = params.get("redirect_url");

  if (!redirectUrl || !redirectUrl.startsWith("/")) {
    return null;
  }

  return redirectUrl;
}

export function resolveSessionGateDecision(
  context: SessionGateContext
): SessionGateDecision {
  const bootstrapStatus = normalizeBootstrapStatus(
    context.bootstrapStatus,
    context.bootstrapErrorStatus
  );
  const isAuthPage = isAuthRoute(context.pathname);
  const hasCookies = hasSessionCookies(context);

  if (!hasCookies) {
    if (isAuthPage) {
      return { type: "allow", clearUser: false };
    }

    return {
      type: "redirect",
      href: getAuthRedirectPath(context),
      clearUser: true,
    };
  }

  if (bootstrapStatus === "loading" || bootstrapStatus === "idle") {
    return { type: "pending", clearUser: false };
  }

  if (bootstrapStatus === "auth_error") {
    if (isAuthPage) {
      return { type: "allow", clearUser: true };
    }

    return {
      type: "redirect",
      href: getAuthRedirectPath(context),
      clearUser: true,
    };
  }

  if (bootstrapStatus === "error") {
    return { type: "allow", clearUser: false };
  }

  if (isAuthPage) {
    return {
      type: "redirect",
      href: getRequestedRedirect(context.search) ?? agentsRoute,
      clearUser: false,
    };
  }

  return { type: "allow", clearUser: false };
}
