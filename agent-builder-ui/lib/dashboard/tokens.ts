/**
 * Dashboard tokens — re-exported from the shared package so the
 * prototype preview and the Build-emitted dashboard read from a single
 * source of truth.
 *
 * Edit values in packages/dashboard-primitives/src/tokens.ts.
 * The Build template reads that same file at scaffold time and embeds
 * it verbatim into each new agent's dashboard/components/ui.tsx —
 * drift between prototype and live dashboard is prevented by
 * construction.
 *
 * Imported via relative path (not the @ruh/dashboard-primitives package
 * name) so Turbopack reads the TS source directly — bun's file: dep
 * resolution produced an unparseable stub at
 * node_modules/@ruh/dashboard-primitives/package.json in CI. The
 * package directory still exists as the source-of-truth filing
 * cabinet; we just don't route through node_modules to reach it.
 */

export { dashboardTokens, dashboardRadii, dashboardSpacing } from "../../../packages/dashboard-primitives/src/tokens";
