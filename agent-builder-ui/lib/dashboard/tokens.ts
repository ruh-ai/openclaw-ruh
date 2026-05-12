/**
 * Shared dashboard design tokens.
 *
 * IMPORTANT: Keep these values in sync with
 *   ruh-backend/src/scaffoldTemplates.ts (the `tokens` object inside
 *   `generateDashboardFiles`).
 *
 * This module exists so the Prototype-stage preview and the Build-generated
 * production dashboard render with the same colors, radii, and spacing. If
 * you change a value here, change it in the backend template too.
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
