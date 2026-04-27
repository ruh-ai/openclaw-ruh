/**
 * The OpenClaw spec version this runtime substrate targets.
 *
 * Lives in its own module so internal callers can import it without
 * pulling in `src/index.ts` (which re-exports every module — creates
 * cycle risks for any module that wants to validate against the
 * runtime's spec version, like pipeline-manifest validation).
 *
 * Bump this constant exactly when a new spec version becomes the
 * substrate's load-time target.
 */

export const SPEC_VERSION = "1.0.0-rc.1" as const;
