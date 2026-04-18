import {
  LayoutDashboard,
  Package,
  Warehouse,
  FileText,
  BarChart3,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Permissions } from "@/hooks/usePermissions";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NavPage {
  /** Unique identifier */
  id: string;
  /** Route path */
  path: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Display label */
  label: string;
  /** If set, user must have this boolean permission === true */
  requiredPermission?: keyof {
    [K in keyof Permissions as Permissions[K] extends boolean ? K : never]: true;
  };
  /** If set, user's role must be in this list (OR with requiredPermission) */
  allowedRoles?: string[];
}

// ─── Center page (always visible, fixed in center slot) ──────────────────────

export const CENTER_PAGE: NavPage = {
  id: "home",
  path: "/",
  icon: LayoutDashboard,
  label: "Home",
};

// ─── Side pages (distributed left/right of center) ───────────────────────────
// Order matters: first half goes LEFT, second half goes RIGHT.

export const SIDE_PAGES: NavPage[] = [
  {
    id: "products",
    path: "/products",
    icon: Package,
    label: "Products",
    requiredPermission: "canManageStock",
  },
  {
    id: "warehouse",
    path: "/stock",
    icon: Warehouse,
    label: "Warehouse",
    requiredPermission: "canManageStock",
  },
  {
    id: "sales",
    path: "/invoices",
    icon: FileText,
    label: "Sales",
    requiredPermission: "canManageInvoices",
  },
  {
    id: "reports",
    path: "/reports",
    icon: BarChart3,
    label: "Reports",
    requiredPermission: "canViewReports",
  },
  {
    id: "users",
    path: "/admin/users",
    icon: Users,
    label: "Users",
    requiredPermission: "canEditUsers",
  },
  {
    id: "settings",
    path: "/admin/settings",
    icon: Settings,
    label: "Settings",
    requiredPermission: "canAccessSettings",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Filter side pages to only those the current user can access,
 * then split into left/right halves around the center button.
 */
export function getVisibleNav(permissions: Permissions) {
  const visible = SIDE_PAGES.filter((page) => {
    // Admin+ sees everything
    if (permissions.isAdmin) return true;

    // Check permission key
    if (page.requiredPermission) {
      return !!permissions[page.requiredPermission];
    }

    // Check allowed roles
    if (page.allowedRoles) {
      return page.allowedRoles.includes(permissions.role);
    }

    // No restriction — visible to all
    return true;
  });

  const mid = Math.ceil(visible.length / 2);
  const left = visible.slice(0, mid);
  const right = visible.slice(mid);

  return { left, center: CENTER_PAGE, right };
}
