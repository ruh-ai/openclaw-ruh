/**
 * Preview-fidelity dashboard primitives.
 *
 * These render exactly like the components emitted by the Build stage
 * (ruh-backend/src/scaffoldTemplates.ts → MetricCard.tsx, DataTable.tsx,
 * ActivityFeed.tsx, BarChart.tsx). The prototype-stage preview uses them
 * so the user sees the same visual shapes they'll get in production.
 *
 * Keep this file's output structurally identical to scaffoldTemplates.ts.
 * Visual drift here = lying to the user about what Build will produce.
 */

import type { CSSProperties, ReactNode } from "react";
import { dashboardTokens as T, dashboardRadii as R, dashboardSpacing as S } from "./tokens";

const cardStyle: CSSProperties = {
  background: T.cardColor,
  border: `1px solid ${T.borderDefault}`,
  borderRadius: R.card,
  padding: S.cardPadding,
  marginBottom: S.cardMargin,
};

export function PreviewMetricCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string | number;
  trend?: string;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        borderLeft: `4px solid ${T.primary}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        margin: 0,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: T.textPrimary }}>{value}</div>
      <div style={{ fontSize: 13, color: T.textSecondary }}>{label}</div>
      {trend && <div style={{ fontSize: 12, color: T.textTertiary }}>{trend}</div>}
    </div>
  );
}

export function PreviewDataTable({
  columns,
  rows,
  emptyMessage = "No data",
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  emptyMessage?: string;
}) {
  function renderCell(value: unknown): ReactNode {
    if (value == null) return "—";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
    return JSON.stringify(value);
  }
  if (!rows.length) {
    return (
      <div
        style={{
          ...cardStyle,
          textAlign: "center",
          color: T.textTertiary,
          padding: 32,
          margin: 0,
        }}
      >
        {emptyMessage}
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "auto", margin: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  borderBottom: `1px solid ${T.borderDefault}`,
                  fontWeight: 600,
                  color: T.textSecondary,
                  background: "#fafafa",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fafafa" : "white" }}>
              {columns.map((c) => (
                <td
                  key={c}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${T.borderDefault}`,
                    color: T.textPrimary,
                  }}
                >
                  {renderCell(row[c] ?? row[c.toLowerCase()])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewTableStatus({ status }: { status: string }) {
  const color =
    status === "active" || status === "ready" || status === "approved"
      ? T.success
      : status === "error" || status === "failed"
      ? T.error
      : T.warning;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: R.pill,
        fontSize: 11,
        fontWeight: 600,
        background: color + "18",
        color,
      }}
    >
      {status}
    </span>
  );
}

interface FeedItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string;
}

export function PreviewActivityFeed({
  items,
  emptyMessage = "No recent activity yet",
}: {
  items: FeedItem[];
  emptyMessage?: string;
}) {
  if (!items.length) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", color: T.textTertiary, margin: 0 }}>
        {emptyMessage}
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, margin: 0 }}>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            padding: "10px 0",
            borderBottom: `1px solid ${T.borderDefault}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 500, color: T.textPrimary, fontSize: 13 }}>{item.title}</div>
            {item.description && (
              <div style={{ fontSize: 12, color: T.textTertiary }}>{item.description}</div>
            )}
          </div>
          {item.timestamp && (
            <div style={{ fontSize: 11, color: T.textTertiary, whiteSpace: "nowrap" }}>
              {item.timestamp}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function PreviewBarChart({
  data,
  label = "",
}: {
  data: Array<{ label: string; value: number }>;
  label?: string;
}) {
  if (!data.length) {
    return (
      <div style={{ ...cardStyle, textAlign: "center", color: T.textTertiary, margin: 0 }}>
        No chart data available
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ ...cardStyle, margin: 0 }}>
      {label && (
        <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>
          {label}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: "100%",
                background: T.primary + "30",
                borderRadius: 4,
                height: Math.max(4, (d.value / max) * 100),
                transition: "height 0.3s",
              }}
            />
            <div style={{ fontSize: 10, color: T.textTertiary, textAlign: "center" }}>
              {d.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPageHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 24,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13, color: T.textSecondary }}>{description}</p>
        )}
      </div>
      {badge}
    </div>
  );
}

/**
 * Horizontal top nav matching scaffoldTemplates.ts → layout.tsx.
 * Gradient logo block + Mission Control wordmark on the left, page tabs
 * on the right. Designed to give the page body full width — vertical
 * sidebars eat too much of the available real estate in the prototype
 * preview pane.
 */
export function PreviewTopNav({
  pages,
  activePath,
  onSelect,
  agentName,
}: {
  pages: Array<{ path: string; title: string }>;
  activePath: string;
  onSelect: (path: string) => void;
  agentName?: string;
}) {
  return (
    <header
      style={{
        background: T.sidebarBg,
        borderBottom: `1px solid ${T.borderDefault}`,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <div
          className="gradient-drift"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: T.gradient,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, lineHeight: 1.2 }}>
            Mission Control
          </div>
          <div
            style={{
              color: T.textSecondary,
              fontSize: 11,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {agentName ? `${agentName} operations` : "Agent operations"}
          </div>
        </div>
      </div>
      <nav
        style={{
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
          marginLeft: "auto",
        }}
        aria-label="Dashboard pages"
      >
        {pages.map((item) => {
          const active = item.path === activePath;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => onSelect(item.path)}
              aria-pressed={active}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                color: active ? T.primary : T.textSecondary,
                background: active ? "rgba(174,0,208,0.08)" : "transparent",
                border: active ? "1px solid rgba(174,0,208,0.20)" : "1px solid transparent",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {item.title}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export const previewStyles = {
  page: {
    padding: S.pagePadding,
    background: T.background,
    minHeight: "100%",
  } as CSSProperties,
  grid: (cols: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: 16,
    marginBottom: 24,
  }),
};
