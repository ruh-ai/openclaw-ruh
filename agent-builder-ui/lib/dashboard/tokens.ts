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
 */

export { dashboardTokens, dashboardRadii, dashboardSpacing } from "@ruh/dashboard-primitives";
