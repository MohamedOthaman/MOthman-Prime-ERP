/**
 * Widget Registry — catalog of all dashboard widgets with role availability.
 *
 * Architecture:
 *   - WIDGET_CATALOG defines every possible widget (id, title, type, roles, etc.)
 *   - ROLE_DEFAULT_WIDGETS maps each role/department to an ordered widget id list
 *   - useRoleWidgets() hook returns the filtered, ordered list for the current user
 *
 * Future persistence:
 *   - Store widget order + hidden set in user_preferences table or localStorage
 *   - Call useRoleWidgets(role, savedOrder?, hiddenIds?) to merge with persisted prefs
 *   - Drag-and-drop reordering writes back to saved state
 */

import { useMemo } from "react";
import type { UserRole, Department } from "@/types/roles";
import { getDepartment } from "@/hooks/usePermissions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WidgetType = "kpi" | "list" | "action" | "alert" | "summary" | "chart";
export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  type: WidgetType;
  size: WidgetSize;
  /** '*' = all roles; otherwise list of specific roles */
  allowedRoles: string[];
  /** '*' = all departments; if set, restricts by department */
  allowedDepartments: string[];
  /** Clicking the widget navigates here */
  route?: string;
  /** Which dashboardService function feeds this widget */
  dataKey?: string;
}

// ─── Widget catalog ───────────────────────────────────────────────────────────

export const WIDGET_CATALOG: WidgetDef[] = [
  // ── Invoice lifecycle widgets ──────────────────────────────────────────────
  {
    id: "invoice_ready",
    title: "Ready Invoices",
    description: "Invoices posted and awaiting warehouse execution",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["invoicing", "warehouse", "operations", "finance", "sales"],
    route: "/invoices",
    dataKey: "fetchInvoiceStatusCounts",
  },
  {
    id: "invoice_done_today",
    title: "Done Today",
    description: "Invoices executed and delivered today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["invoicing", "warehouse", "operations", "finance", "sales"],
    route: "/invoices",
    dataKey: "fetchInvoiceStatusCounts",
  },
  {
    id: "invoice_received_today",
    title: "Received Today",
    description: "Customer-confirmed invoices today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["invoicing", "finance", "sales"],
    route: "/invoices",
    dataKey: "fetchInvoiceStatusCounts",
  },
  {
    id: "invoice_cancelled",
    title: "Cancelled Invoices",
    description: "Cancelled invoices requiring attention",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["invoicing", "finance", "operations"],
    route: "/invoices",
    dataKey: "fetchInvoiceStatusCounts",
  },
  {
    id: "invoice_recent_list",
    title: "Recent Invoices",
    description: "Latest invoices across lifecycle",
    type: "list",
    size: "md",
    allowedRoles: ["*"],
    allowedDepartments: ["invoicing", "finance", "sales"],
    route: "/invoices",
    dataKey: "fetchInvoiceStatusCounts",
  },

  // ── Picking / warehouse execution widgets ──────────────────────────────────
  {
    id: "picking_ready",
    title: "Ready to Pick",
    description: "Invoices awaiting warehouse picking",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "operations"],
    route: "/warehouse/picking",
    dataKey: "fetchPickingStats",
  },
  {
    id: "picking_active",
    title: "Active Picking",
    description: "Picking sessions currently in progress",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "operations"],
    route: "/warehouse/picking",
    dataKey: "fetchPickingStats",
  },
  {
    id: "picking_done_today",
    title: "Picked Today",
    description: "Picking sessions completed today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "operations"],
    dataKey: "fetchPickingStats",
  },

  // ── GRN / receiving widgets ────────────────────────────────────────────────
  {
    id: "grn_today",
    title: "Today's GRNs",
    description: "Goods received today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    route: "/grn",
    dataKey: "fetchGrnStatusCounts",
  },
  {
    id: "grn_pending_qc",
    title: "Pending QC",
    description: "GRNs awaiting inspection",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    route: "/grn",
    dataKey: "fetchGrnStatusCounts",
  },
  {
    id: "grn_awaiting_posting",
    title: "Awaiting Posting",
    description: "Approved GRNs ready to post to inventory",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    route: "/grn",
    dataKey: "fetchGrnStatusCounts",
  },
  {
    id: "grn_completed",
    title: "Completed GRNs",
    description: "GRNs posted to inventory",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    dataKey: "fetchGrnStatusCounts",
  },
  {
    id: "grn_recent_list",
    title: "Recent Deliveries",
    description: "Latest GRN entries",
    type: "list",
    size: "md",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    route: "/grn",
    dataKey: "fetchGrnStatusCounts",
  },

  // ── QC widgets ────────────────────────────────────────────────────────────
  {
    id: "qc_hold_lines",
    title: "Lines on Hold",
    description: "QC lines currently held across all GRNs",
    type: "kpi",
    size: "sm",
    allowedRoles: ["qc", "warehouse_manager", "inventory_controller"],
    allowedDepartments: ["warehouse"],
    route: "/grn",
    dataKey: "fetchQcLineCounts",
  },
  {
    id: "qc_reject_lines",
    title: "Rejected Lines",
    description: "QC lines rejected across all GRNs",
    type: "kpi",
    size: "sm",
    allowedRoles: ["qc", "warehouse_manager", "inventory_controller"],
    allowedDepartments: ["warehouse"],
    route: "/grn",
    dataKey: "fetchQcLineCounts",
  },

  // ── Returns widgets ────────────────────────────────────────────────────────
  {
    id: "returns_pending",
    title: "Pending Returns",
    description: "Returns not yet processed",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "invoicing", "operations", "finance", "sales"],
    route: "/returns",
    dataKey: "fetchReturnCounts",
  },
  {
    id: "returns_received",
    title: "Posted Returns",
    description: "Returns processed and stock updated",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "invoicing", "operations", "finance"],
    route: "/returns",
    dataKey: "fetchReturnCounts",
  },

  // ── Inventory movement widgets ─────────────────────────────────────────────
  {
    id: "movements_today",
    title: "Movements Today",
    description: "Total inventory movements today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing", "operations"],
    route: "/warehouse/movements",
    dataKey: "fetchMovementsSummary",
  },
  {
    id: "inbound_today",
    title: "Inbound Today",
    description: "Inbound stock movements today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse", "purchasing"],
    route: "/warehouse/movements",
    dataKey: "fetchMovementsSummary",
  },
  {
    id: "outbound_today",
    title: "Outbound Today",
    description: "Outbound stock movements today",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["warehouse"],
    route: "/warehouse/movements",
    dataKey: "fetchMovementsSummary",
  },

  // ── Sales / customer widgets ───────────────────────────────────────────────
  {
    id: "customer_count",
    title: "Total Customers",
    description: "Active customer base",
    type: "kpi",
    size: "sm",
    allowedRoles: ["*"],
    allowedDepartments: ["sales", "invoicing", "finance"],
    route: "/customers",
    dataKey: "fetchSalesContext",
  },
  {
    id: "salesman_perf",
    title: "Salesman Performance",
    description: "Invoice count and revenue per salesman",
    type: "list",
    size: "md",
    allowedRoles: ["sales_manager", "admin", "ops_manager", "ceo", "gm"],
    allowedDepartments: ["*"],
    dataKey: "fetchSalesContext",
  },
];

// ─── Default widget lists per role/department ─────────────────────────────────
// These define the baseline widget order. Future persistence will merge with user prefs.

export const ROLE_DEFAULT_WIDGETS: Record<string, string[]> = {
  // Tier overrides
  admin:       ["grn_today", "invoice_ready", "picking_ready", "picking_active", "returns_pending", "movements_today", "grn_awaiting_posting", "invoice_done_today", "invoice_cancelled"],
  ops_manager: ["invoice_ready", "picking_ready", "grn_today", "returns_pending", "movements_today", "grn_awaiting_posting", "invoice_done_today"],

  // Department defaults
  warehouse:   ["picking_ready", "picking_active", "returns_pending", "grn_today", "grn_pending_qc", "movements_today", "outbound_today"],
  purchasing:  ["grn_today", "grn_pending_qc", "grn_awaiting_posting", "grn_completed", "movements_today", "inbound_today"],
  qc:          ["grn_pending_qc", "qc_hold_lines", "qc_reject_lines", "grn_awaiting_posting"],
  invoicing:   ["invoice_ready", "invoice_done_today", "invoice_received_today", "invoice_cancelled", "returns_pending"],
  finance:     ["invoice_ready", "invoice_done_today", "invoice_received_today", "invoice_cancelled", "returns_pending", "returns_received"],
  sales:       ["invoice_ready", "invoice_done_today", "customer_count", "returns_pending", "salesman_perf"],
  executive:   ["invoice_ready", "invoice_done_today", "grn_today", "picking_ready", "returns_pending", "movements_today"],
};

// ─── Per-role lookup (role takes priority over department) ─────────────────────

function getDefaultWidgetIds(role: string): string[] {
  if (role in ROLE_DEFAULT_WIDGETS) return ROLE_DEFAULT_WIDGETS[role];
  const dept = getDepartment(role);
  return ROLE_DEFAULT_WIDGETS[dept] ?? ROLE_DEFAULT_WIDGETS.finance;
}

// ─── Filtering logic ─────────────────────────────────────────────────────────

function widgetAllowedForRole(widget: WidgetDef, role: string, department: string): boolean {
  // Role check
  const roleOk =
    widget.allowedRoles.includes("*") || widget.allowedRoles.includes(role);

  // Department check
  const deptOk =
    widget.allowedDepartments.includes("*") ||
    widget.allowedDepartments.includes(department);

  return roleOk && deptOk;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the ordered, role-filtered widget list for the current user.
 *
 * @param role      - raw role string from DB
 * @param department - inferred department from usePermissions
 * @param hiddenIds  - optional set of widget ids the user has hidden (future persistence)
 * @param customOrder - optional saved order overriding defaults (future persistence)
 */
export function useRoleWidgets(
  role: string,
  department: string,
  hiddenIds: Set<string> = new Set(),
  customOrder?: string[]
): WidgetDef[] {
  return useMemo(() => {
    const order = customOrder ?? getDefaultWidgetIds(role);
    const catalogById = new Map(WIDGET_CATALOG.map(w => [w.id, w]));

    return order
      .filter(id => !hiddenIds.has(id))
      .map(id => catalogById.get(id))
      .filter((w): w is WidgetDef => !!w && widgetAllowedForRole(w, role, department));
  }, [role, department, hiddenIds, customOrder]);
}

// ─── Utility: get widget by id ────────────────────────────────────────────────

export function getWidget(id: string): WidgetDef | undefined {
  return WIDGET_CATALOG.find(w => w.id === id);
}

// ─── Re-export UserRole for consumers ────────────────────────────────────────
export type { UserRole, Department };

// ─── Dashboard preferences (localStorage-backed) ─────────────────────────────
/**
 * useDashboardPrefs — per-role localStorage persistence for widget order and
 * hidden widget ids.
 *
 * Provides the foundation for drag-and-drop personalization without requiring
 * a DB migration. When DB persistence is added later, swap the localStorage
 * calls for Supabase reads/writes and keep the same interface.
 */

import { useState, useCallback, useEffect } from "react";

interface DashboardPrefs {
  hiddenIds: string[];
  customOrder?: string[];
}

function prefsKey(role: string) {
  return `dashboard_prefs_v1_${role}`;
}

function loadPrefs(role: string): DashboardPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(role));
    if (raw) return JSON.parse(raw) as DashboardPrefs;
  } catch { /* ignore parse errors */ }
  return { hiddenIds: [] };
}

function savePrefs(role: string, prefs: DashboardPrefs) {
  try {
    localStorage.setItem(prefsKey(role), JSON.stringify(prefs));
  } catch { /* ignore storage errors (private browsing, full storage) */ }
}

export interface DashboardPrefsAPI {
  hiddenIds: Set<string>;
  customOrder: string[] | undefined;
  /** Hide a widget by id (persisted) */
  hideWidget: (id: string) => void;
  /** Unhide a widget by id (persisted) */
  showWidget: (id: string) => void;
  /** Persist a full widget order array (from drag-and-drop) */
  reorder: (newOrder: string[]) => void;
  /** Reset to role defaults (clears localStorage entry) */
  reset: () => void;
}

export function useDashboardPrefs(role: string): DashboardPrefsAPI {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadPrefs(role));

  // Re-load if role changes (preview mode switch)
  useEffect(() => {
    setPrefs(loadPrefs(role));
  }, [role]);

  const persist = useCallback(
    (next: DashboardPrefs) => {
      setPrefs(next);
      savePrefs(role, next);
    },
    [role],
  );

  const hideWidget = useCallback(
    (id: string) => {
      persist({
        ...prefs,
        hiddenIds: prefs.hiddenIds.includes(id) ? prefs.hiddenIds : [...prefs.hiddenIds, id],
      });
    },
    [prefs, persist],
  );

  const showWidget = useCallback(
    (id: string) => {
      persist({ ...prefs, hiddenIds: prefs.hiddenIds.filter((h) => h !== id) });
    },
    [prefs, persist],
  );

  const reorder = useCallback(
    (newOrder: string[]) => {
      persist({ ...prefs, customOrder: newOrder });
    },
    [prefs, persist],
  );

  const reset = useCallback(() => {
    try { localStorage.removeItem(prefsKey(role)); } catch { /* ignore */ }
    setPrefs({ hiddenIds: [] });
  }, [role]);

  return {
    hiddenIds: new Set(prefs.hiddenIds),
    customOrder: prefs.customOrder,
    hideWidget,
    showWidget,
    reorder,
    reset,
  };
}
