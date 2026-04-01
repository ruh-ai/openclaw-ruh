import type { NextRequest } from "next/server";

const DEFAULT_AUTH_ME_PATH = "/users/me";
const DEFAULT_SESSION_COOKIE_NAME = "accessToken";
const LOCAL_DEVELOPMENT_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export class RouteAuthError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.name = "RouteAuthError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== name) continue;

    const value = rest.join("=");
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function validateSameOrigin(req: Pick<NextRequest, "headers" | "url">): void {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return;

  const requestOrigin = new URL(req.url).origin;
  if (originHeader !== requestOrigin) {
    throw new RouteAuthError(403, "forbidden_origin", "Origin must match the request host.");
  }
}

export interface BridgeSessionAuthConfig {
  backendUrl: string;
  authMePath?: string;
  sessionCookieName?: string;
  fetchImpl?: typeof fetch;
  nodeEnv?: string;
  allowLocalDevelopmentBypass?: boolean;
}

function isLocalDevelopmentUrl(value: string): boolean {
  try {
    return LOCAL_DEVELOPMENT_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function shouldAllowLocalDevelopmentBypass(
  req: Pick<NextRequest, "url">,
  config: BridgeSessionAuthConfig,
): boolean {
  if (!config.allowLocalDevelopmentBypass) return false;
  if ((config.nodeEnv ?? process.env.NODE_ENV) !== "development") return false;

  return isLocalDevelopmentUrl(req.url) && isLocalDevelopmentUrl(config.backendUrl);
}

export async function requireAuthenticatedBridgeSession(
  req: NextRequest,
  config: BridgeSessionAuthConfig,
): Promise<void> {
  validateSameOrigin(req);

  if (shouldAllowLocalDevelopmentBypass(req, config)) {
    return;
  }

  const accessToken = parseCookieValue(
    req.headers.get("cookie"),
    config.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME,
  );
  if (!accessToken) {
    throw new RouteAuthError(401, "unauthorized", "Missing access token.");
  }

  if (!config.backendUrl) {
    throw new RouteAuthError(503, "auth_unavailable", "Auth validation backend is not configured.");
  }

  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(
      `${config.backendUrl}${config.authMePath ?? DEFAULT_AUTH_ME_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );
  } catch (error) {
    throw new RouteAuthError(
      503,
      "auth_unavailable",
      `Failed to validate session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new RouteAuthError(401, "unauthorized", "Session is missing, expired, or invalid.");
  }

  if (!response.ok) {
    throw new RouteAuthError(
      503,
      "auth_unavailable",
      `Session validation failed with status ${response.status}.`,
    );
  }
}
