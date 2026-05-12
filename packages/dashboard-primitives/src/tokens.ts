/**
 * Shared dashboard design tokens — source of truth.
 *
 * Both surfaces read these values:
 *   • Prototype renderer (agent-builder-ui's lib/dashboard/tokens.ts
 *     re-exports from here, used at React render time).
 *   • Build template (ruh-backend's scaffoldTemplates reads this file
 *     verbatim at scaffold time and embeds it into each new agent's
 *     dashboard/components/ui.tsx).
 *
 * Edit values here only. The prototype preview and the deployed
 * dashboard will pick them up the next time scaffold runs.
 */

export const dashboardTokens = {
  primary: "#ae00d0",
  primaryHover: "#9400b4",
  secondary: "#7b5aff",
  background: "#f9f7f9",
  cardColor: "#ffffff",
  sidebarBg: "#fdfbff",
  textPrimary: "#121212",
  textSecondary: "#4b5563",
  textTertiary: "#9ca3af",
  borderDefault: "#e5e7eb",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  gradient: "linear-gradient(135deg, #ae00d0, #7b5aff)",
} as const;

export const dashboardRadii = {
  card: 12,
  control: 8,
  pill: 6,
} as const;

export const dashboardSpacing = {
  cardPadding: 20,
  cardMargin: 16,
  pagePadding: 24,
} as const;
