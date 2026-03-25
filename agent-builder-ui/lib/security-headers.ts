const DEFAULT_API_ORIGIN = "http://localhost:8000";

type SecurityHeadersOptions = {
  apiUrl?: string;
  authUrl?: string;
  imageSources?: string[];
  nodeEnv?: string;
};

function getOrigin(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function uniqueSources(sources: Array<string | undefined>): string[] {
  return [...new Set(sources.filter((source): source is string => Boolean(source)))];
}

function formatDirective(name: string, sources: string[]): string {
  return `${name} ${sources.join(" ")}`;
}

export function getSecurityHeaders({
  apiUrl = DEFAULT_API_ORIGIN,
  authUrl,
  imageSources = [],
  nodeEnv = process.env.NODE_ENV,
}: SecurityHeadersOptions = {}) {
  const connectSources = uniqueSources([
    "'self'",
    getOrigin(apiUrl) ?? DEFAULT_API_ORIGIN,
    getOrigin(authUrl),
    nodeEnv === "development" ? "ws:" : undefined,
    nodeEnv === "development" ? "wss:" : undefined,
  ]);

  const scriptSources = uniqueSources([
    "'self'",
    "'unsafe-inline'",
    nodeEnv === "development" ? "'unsafe-eval'" : undefined,
  ]);

  const csp = [
    formatDirective("default-src", ["'self'"]),
    formatDirective("base-uri", ["'self'"]),
    formatDirective("form-action", ["'self'"]),
    formatDirective("frame-ancestors", ["'none'"]),
    formatDirective("object-src", ["'none'"]),
    formatDirective("connect-src", connectSources),
    formatDirective("img-src", uniqueSources(["'self'", "data:", "blob:", ...imageSources])),
    formatDirective("font-src", ["'self'", "data:"]),
    formatDirective("style-src", ["'self'", "'unsafe-inline'"]),
    formatDirective("script-src", scriptSources),
  ].join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: csp,
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
  ];
}
