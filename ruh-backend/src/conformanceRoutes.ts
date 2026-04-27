/**
 * Conformance routes — substrate-driven validation of OpenClaw v1 manifests.
 * Mounted at /api/conformance in app.ts.
 *
 * Endpoints:
 *   POST   /api/conformance/check
 *
 * Thin adapter over @ruh/openclaw-runtime's `runConformance()`. The
 * substrate is authoritative on validation rules; this route is just the
 * HTTP entry point.
 *
 * @kb: 004-api-reference
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { runConformance, SPEC_VERSION } from '@ruh/openclaw-runtime';
import * as _authMiddleware from './auth/middleware';
import { httpError } from './utils';

// Late-binding wrapper so that `mock.module('./auth/middleware')` replacements
// in tests take effect even after this module has already been evaluated.
const requireAuth: typeof _authMiddleware.requireAuth =
  (req, res, next) => _authMiddleware.requireAuth(req, res, next);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function createConformanceRouter(): Router {
  const router = Router();

  // ── POST /check ─────────────────────────────────────────────────────────
  // Body: { pipelineManifest?: unknown, dashboardManifest?: unknown }
  // Returns the substrate's ConformanceReport verbatim, plus the spec
  // version the substrate targets so callers can detect drift.
  //
  // Bad-input semantics: a malformed manifest is a *finding* in the
  // returned report, not a 400. We only return 400 when the caller gives
  // us nothing to validate (both fields undefined) — that's a request
  // shape error, not a manifest defect.
  router.post('/check', requireAuth, asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      pipelineManifest?: unknown;
      dashboardManifest?: unknown;
    };

    const hasPipeline = body.pipelineManifest !== undefined;
    const hasDashboard = body.dashboardManifest !== undefined;
    if (!hasPipeline && !hasDashboard) {
      throw httpError(400, 'pipelineManifest or dashboardManifest is required');
    }

    const report = runConformance({
      pipelineManifest: body.pipelineManifest,
      dashboardManifest: body.dashboardManifest,
    });

    res.json({ spec_version: SPEC_VERSION, report });
  }));

  return router;
}
