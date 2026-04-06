/**
 * Dashboard Component Library
 *
 * Pre-built components that the architect uses when generating dashboard pages.
 * The architect writes page files that compose these components with agent-specific data.
 *
 * Usage in generated pages:
 *   import { MetricCards, DataTable, StatusBadge, ActivityFeed, EmptyState } from "@/components/dashboard";
 */

export { MetricCards, type MetricCard } from "./MetricCards";
export { DataTable, type DataTableColumn, type DataTableProps } from "./DataTable";
export { StatusBadge } from "./StatusBadge";
export { ActivityFeed, type ActivityItem } from "./ActivityFeed";
export { EmptyState } from "./EmptyState";
