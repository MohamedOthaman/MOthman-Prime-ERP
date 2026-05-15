import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  BarChart3,
  Package,
  Settings,
  FileSpreadsheet,
  ScanLine,
  RotateCcw,
  Activity,
  Users,
  UserCog,
  Snowflake,
  ListChecks,
  Shield,
  type LucideIcon,
} from "lucide-react";
import type { Permissions } from "@/hooks/usePermissions";

export type PermissionKey =
  | "canManageInvoices"
  | "canManageReceiving"
  | "canImportExport"
  | "canViewReports"
  | "canManageStock"
  | "canManageCustomers"
  | "canManageSalesmen"
  | "canEditUsers"
  | "canAccessSettings"
  | "isOwner"
  | "isAdmin"
  | "isExecutive"
  | "isManager";

export interface SidebarItem {
  id: string;
  /** i18n key — resolved at render time via t(labelKey). Fallback label provided. */
  labelKey: string;
  fallbackLabel: string;
  icon: LucideIcon;
  path: string;
  /** Item visible when ANY of these permissions is true. Omit to always show. */
  permissions?: PermissionKey[];
  end?: boolean;
}

export interface SidebarSectionConfig {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  items: SidebarItem[];
}

export const sidebarConfig: SidebarSectionConfig[] = [
  {
    id: "dashboard",
    labelKey: "sidebar:section.dashboard",
    fallbackLabel: "Dashboard",
    items: [
      {
        id: "home",
        labelKey: "sidebar:item.dashboard",
        fallbackLabel: "Dashboard",
        icon: LayoutDashboard,
        path: "/",
        end: true,
      },
      {
        id: "stock",
        labelKey: "sidebar:item.stock",
        fallbackLabel: "Stock",
        icon: Package,
        path: "/stock",
        permissions: ["canManageStock", "isAdmin"],
      },
    ],
  },
  {
    id: "sales",
    labelKey: "sidebar:section.sales",
    fallbackLabel: "Sales",
    items: [
      {
        id: "invoices",
        labelKey: "sidebar:item.invoices",
        fallbackLabel: "Invoices",
        icon: FileText,
        path: "/invoices",
        permissions: ["canManageInvoices"],
      },
      {
        id: "invoice-entry",
        labelKey: "sidebar:item.newInvoice",
        fallbackLabel: "New Invoice",
        icon: FileText,
        path: "/invoice-entry",
        permissions: ["canManageInvoices"],
      },
      {
        id: "customers",
        labelKey: "sidebar:item.customers",
        fallbackLabel: "Customers",
        icon: Users,
        path: "/customers",
        permissions: ["canManageInvoices", "isAdmin"],
      },
      {
        id: "salesmen",
        labelKey: "sidebar:item.salesmen",
        fallbackLabel: "Salesmen",
        icon: UserCog,
        path: "/salesmen",
        permissions: ["isAdmin"],
      },
      {
        id: "returns",
        labelKey: "sidebar:item.returns",
        fallbackLabel: "Returns",
        icon: RotateCcw,
        path: "/returns",
        permissions: ["canManageInvoices", "canManageReceiving"],
      },
    ],
  },
  {
    id: "warehouse",
    labelKey: "sidebar:section.warehouse",
    fallbackLabel: "Warehouse",
    items: [
      {
        id: "picking",
        labelKey: "sidebar:item.picking",
        fallbackLabel: "Picking",
        icon: ScanLine,
        path: "/warehouse/picking",
        permissions: ["canManageStock", "isAdmin"],
      },
      {
        id: "movements",
        labelKey: "sidebar:item.movements",
        fallbackLabel: "Movements",
        icon: Activity,
        path: "/warehouse/movements",
        permissions: ["canManageStock", "isAdmin"],
      },
      {
        id: "fridge",
        labelKey: "sidebar:item.fridge",
        fallbackLabel: "Fridge",
        icon: Snowflake,
        path: "/warehouse/fridge",
        permissions: ["canManageStock", "isAdmin"],
      },
      {
        id: "batch-trace",
        labelKey: "sidebar:item.batchTrace",
        fallbackLabel: "Batch Trace",
        icon: ListChecks,
        path: "/warehouse/batch-trace",
        permissions: ["canManageStock", "isAdmin"],
      },
    ],
  },
  {
    id: "receiving",
    labelKey: "sidebar:section.receiving",
    fallbackLabel: "Receiving",
    items: [
      {
        id: "grn",
        labelKey: "sidebar:item.grn",
        fallbackLabel: "GRN",
        icon: ClipboardList,
        path: "/grn",
        permissions: ["canManageReceiving", "isAdmin"],
      },
      {
        id: "products",
        labelKey: "sidebar:item.products",
        fallbackLabel: "Products",
        icon: Package,
        path: "/products",
        permissions: ["canManageStock", "isAdmin"],
      },
      {
        id: "import-export",
        labelKey: "sidebar:item.importExport",
        fallbackLabel: "Import / Export",
        icon: FileSpreadsheet,
        path: "/import-export",
        permissions: ["canImportExport", "isAdmin"],
      },
    ],
  },
  {
    id: "reports",
    labelKey: "sidebar:section.reports",
    fallbackLabel: "Reports",
    items: [
      {
        id: "reports",
        labelKey: "sidebar:item.reports",
        fallbackLabel: "Reports",
        icon: BarChart3,
        path: "/reports",
        permissions: ["canViewReports"],
      },
    ],
  },
  {
    id: "admin",
    labelKey: "sidebar:section.admin",
    fallbackLabel: "Admin",
    items: [
      {
        id: "users",
        labelKey: "sidebar:item.users",
        fallbackLabel: "Users",
        icon: UserCog,
        path: "/admin/users",
        permissions: ["canEditUsers"],
      },
      {
        id: "settings",
        labelKey: "sidebar:item.settings",
        fallbackLabel: "Settings",
        icon: Settings,
        path: "/admin/settings",
        permissions: ["isAdmin"],
      },
      {
        id: "preview-as",
        labelKey: "sidebar:item.previewAs",
        fallbackLabel: "Preview As",
        icon: Shield,
        path: "/admin/preview-as",
        permissions: ["isAdmin"],
      },
      {
        id: "sync-log",
        labelKey: "sidebar:item.syncLog",
        fallbackLabel: "Sync Log",
        icon: Activity,
        path: "/admin/sync-log",
        permissions: ["isAdmin"],
      },
      {
        id: "telemetry",
        labelKey: "sidebar:item.telemetry",
        fallbackLabel: "Telemetry",
        icon: Activity,
        path: "/admin/telemetry",
        permissions: ["isAdmin"],
      },
      {
        id: "audit",
        labelKey: "sidebar:item.audit",
        fallbackLabel: "Audit",
        icon: Activity,
        path: "/audit",
        permissions: ["isAdmin", "isOwner"],
      },
    ],
  },
];

export function isItemVisible(item: SidebarItem, permissions: Permissions): boolean {
  if (!item.permissions || item.permissions.length === 0) return true;
  return item.permissions.some((key) => Boolean(permissions[key]));
}

export function getVisibleSections(
  permissions: Permissions,
): Array<SidebarSectionConfig & { items: SidebarItem[] }> {
  return sidebarConfig
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isItemVisible(item, permissions)),
    }))
    .filter((section) => section.items.length > 0);
}
