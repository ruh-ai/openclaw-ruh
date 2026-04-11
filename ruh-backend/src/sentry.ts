/**
 * Sentry error tracking for ruh-backend.
 *
 * Activates only when SENTRY_DSN is set. Safe to import unconditionally —
 * all exports are no-ops when Sentry is disabled.
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN || '';
const enabled = Boolean(dsn);

if (enabled) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    // Attach request data (method, url, headers) to error events
    integrations: [
      Sentry.extraErrorDataIntegration(),
    ],
    // Scrub sensitive fields from breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' && breadcrumb.data) {
        delete breadcrumb.data['request_body'];
      }
      return breadcrumb;
    },
  });
}

export { Sentry, enabled as sentryEnabled };

/**
 * Express error handler — register as the LAST error middleware.
 * Captures 5xx errors to Sentry with request context.
 */
export function sentryErrorHandler() {
  if (!enabled) {
    // Return a no-op middleware when Sentry is disabled
    return (_err: Error, _req: any, _res: any, next: any) => next(_err);
  }
  return Sentry.setupExpressErrorHandler as any;
}
