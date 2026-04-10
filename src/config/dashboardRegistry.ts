/**
 * Dashboard Widget Registry
 *
 * This is the architectural foundation for the future visual dashboard builder.
 * It defines:
 *   1. Widget types that can exist on a dashboard
 *   2. The shape of a dashboard layout config
 *   3. The concept of per-role default configs (future: stored in DB)
 *
 * Current state: type definitions + static catalog only.
 * Future state: configs are fetched from `dashboard_configs` DB table and
 * rendered dynamically by a drag-and-drop visual builder accessible to owner/admin.
 *
 * Widget rendering lives in src/components/dashboard/DashboardShell.tsx —
 * each WidgetType maps to one of the exported components there.
 */

// ─── Widget types ─────────────────────────────────────────────────────────────

export type WidgetType =
  | "kpi-row"          // KpiGrid — row of 2-4 KPI cards
  | "action-grid"      // ActionGrid — grid of navigation shortcuts
  | "data-table"       // SectionCard + table of recent records
  | "activity-feed"    // Recent system activity log
  | "alert-panel"      // AlertsPanel from notifications
  | "progress-bar"     // Progress bar / target tracker
  | "chart-bar"        // Bar chart (future recharts integration)
  | "chart-line"       // Line chart (future recharts integration)
  | "stat-mini"        // Single compact metric inline
  | "two-col-section"; // Two-column SectionCard layout

// ─── Widget definition ────────────────────────────────────────────────────────

export interface WidgetDef {
  /** Unique ID within the dashboard */
  id: string;
  /** Which component to render */
  type: WidgetType;
  /** Optional title override */
  title?: string;
  /** Layout span: full-width or half (in 2-col grid) */
  span: "full" | "half";
  /** Component-specific props — validated at render time */
  props: Record<string, unknown>;
}

// ─── Dashboard layout config ──────────────────────────────────────────────────

export interface DashboardLayoutConfig {
  /** Unique key — matches the role or role group */
  id: string;
  /** Human-readable role label */
  roleLabel: string;
  /** Short description of who sees this dashboard */
  description: string;
  /** Ordered list of widgets top-to-bottom */
  widgets: WidgetDef[];
  /** Tiers that can access this layout */
  allowedTiers: string[];
  /** Accent color key from ACCENT map in DashboardShell */
  accent: string;
}

// ─── Widget catalog ───────────────────────────────────────────────────────────
// Maps widget types to metadata for the visual builder UI

export interface WidgetCatalogEntry {
  type: WidgetType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  /** Minimum tier required to use this widget */
  minTier: "user" | "manager" | "admin" | "executive" | "owner";
  defaultProps: Record<string, unknown>;
}

export const WIDGET_CATALOG: Record<WidgetType, WidgetCatalogEntry> = {
  "kpi-row": {
    type: "kpi-row",
    label: "KPI Cards",
    description: "Row of 2–4 key performance metric cards",
    icon: "LayoutGrid",
    minTier: "user",
    defaultProps: { count: 4 },
  },
  "action-grid": {
    type: "action-grid",
    label: "Quick Actions",
    description: "Navigation shortcut grid",
    icon: "Zap",
    minTier: "user",
    defaultProps: { cols: 4 },
  },
  "data-table": {
    type: "data-table",
    label: "Recent Records",
    description: "Latest entries from any data source",
    icon: "Table",
    minTier: "user",
    defaultProps: { source: "none", limit: 5 },
  },
  "activity-feed": {
    type: "activity-feed",
    label: "Activity Feed",
    description: "Recent system audit log",
    icon: "Activity",
    minTier: "admin",
    defaultProps: { count: 10 },
  },
  "alert-panel": {
    type: "alert-panel",
    label: "Alerts Panel",
    description: "System alerts and notifications",
    icon: "Bell",
    minTier: "manager",
    defaultProps: {},
  },
  "progress-bar": {
    type: "progress-bar",
    label: "Progress / Target",
    description: "Linear progress bar with target value",
    icon: "TrendingUp",
    minTier: "manager",
    defaultProps: { value: 0, target: 100, label: "Progress" },
  },
  "chart-bar": {
    type: "chart-bar",
    label: "Bar Chart",
    description: "Vertical bar chart visualization",
    icon: "BarChart3",
    minTier: "manager",
    defaultProps: { source: "none" },
  },
  "chart-line": {
    type: "chart-line",
    label: "Line Chart",
    description: "Time-series trend chart",
    icon: "LineChart",
    minTier: "executive",
    defaultProps: { source: "none" },
  },
  "stat-mini": {
    type: "stat-mini",
    label: "Mini Stat",
    description: "Single compact metric inline",
    icon: "Hash",
    minTier: "user",
    defaultProps: { label: "Metric", value: "—" },
  },
  "two-col-section": {
    type: "two-col-section",
    label: "Two-Column Section",
    description: "Side-by-side content cards",
    icon: "Columns",
    minTier: "user",
    defaultProps: {},
  },
};

// ─── Default role layout registry ─────────────────────────────────────────────
// Future: these are fetched from `dashboard_configs` table and can be
// customised via the visual builder. For now they serve as named constants
// that document the intended layout per role group.

export const DASHBOARD_ROLE_KEYS = {
  OWNER: "owner",
  EXECUTIVE: "executive",
  ADMIN: "admin",
  WAREHOUSE: "warehouse",
  SALES: "sales",
  FINANCE: "finance",
  PURCHASING: "purchasing",
  QC: "qc",
  DEFAULT: "default",
} as const;

export type DashboardRoleKey = (typeof DASHBOARD_ROLE_KEYS)[keyof typeof DASHBOARD_ROLE_KEYS];
