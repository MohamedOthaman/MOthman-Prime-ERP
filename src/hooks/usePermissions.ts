import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import type { UserRole, RoleTier, Department } from "@/types/roles";

// ─── Tier mapping ────────────────────────────────────────────────────────────

const TIER_MAP: Record<string, RoleTier> = {
  owner: "owner",

  // Executive — company principals with broad visibility
  ceo: "executive",
  gm: "executive",

  // Admin — operational control
  admin: "admin",
  ops_manager: "admin",

  // Manager — department-level authority
  sales_manager: "manager",
  purchase_manager: "manager",
  brand_manager: "manager",
  warehouse_manager: "manager",
  inventory_controller: "manager",

  // User/Staff — operational roles (everything else)
  salesman: "user",
  sales: "user",
  accountant: "user",
  accounting: "user",
  invoice_team: "user",
  inventory: "user",
  warehouse: "user",
  cashier: "user",
  secretary: "user",
  purchase: "user",
  hr: "user",
  qc: "user",
  read_only: "user",
};

// ─── Department inference ────────────────────────────────────────────────────

const DEPARTMENT_MAP: Record<string, Department> = {
  owner: "operations",
  admin: "operations",
  ops_manager: "operations",

  ceo: "executive",
  gm: "executive",

  sales_manager: "sales",
  salesman: "sales",
  sales: "sales",

  warehouse: "warehouse",
  warehouse_manager: "warehouse",
  inventory_controller: "warehouse",
  inventory: "warehouse",
  qc: "warehouse",

  purchase_manager: "purchasing",
  purchase: "purchasing",

  accountant: "finance",
  accounting: "finance",
  cashier: "finance",

  invoice_team: "invoicing",

  brand_manager: "marketing",

  hr: "hr",

  secretary: "general",
  read_only: "general",
};

// ─── Tier hierarchy levels (for >= comparisons) ──────────────────────────────

const TIER_LEVEL: Record<RoleTier, number> = {
  owner: 5,
  executive: 4,
  admin: 3,
  manager: 2,
  user: 1,
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface Permissions {
  /** Raw role string from DB */
  role: string;
  /** Resolved authority tier */
  tier: RoleTier;
  /** Inferred business department */
  department: Department;

  // ── Tier checks (hierarchical — higher includes lower) ──
  isOwner: boolean;
  isExecutive: boolean;    // true for owner + executive
  isAdmin: boolean;        // true for owner + executive + admin
  isManager: boolean;      // true for owner + executive + admin + manager

  // ── Feature permissions ──
  canEditUsers: boolean;
  canAccessSettings: boolean;
  canViewReports: boolean;
  canManageStock: boolean;
  canManageInvoices: boolean;
  canManageReceiving: boolean;
  canManageSalesmen: boolean;
  canManageCustomers: boolean;
  canImportExport: boolean;
  canUseVisualBuilder: boolean;
  canPreviewAsUser: boolean;
}

function getTier(role: string): RoleTier {
  return TIER_MAP[role] ?? "user";
}

function getDepartment(role: string): Department {
  return DEPARTMENT_MAP[role] ?? "general";
}

function atLeast(role: string, minimumTier: RoleTier): boolean {
  return TIER_LEVEL[getTier(role)] >= TIER_LEVEL[minimumTier];
}

function isInDepartment(role: string, ...departments: Department[]): boolean {
  return departments.includes(getDepartment(role));
}

export function usePermissions(): Permissions {
  const { role: authRole } = useAuth();
  const { previewRole } = usePreviewMode();

  // When an admin is previewing another role, use that role for all permission
  // calculations. The caller's actual auth role is unaffected.
  const role = previewRole ?? authRole;

  const tier = getTier(role);
  const department = getDepartment(role);
  const tierLevel = TIER_LEVEL[tier];

  // Hierarchical tier checks
  const isOwner = tier === "owner";
  const isExecutive = tierLevel >= TIER_LEVEL.executive;
  const isAdmin = tierLevel >= TIER_LEVEL.admin;
  const isManager = tierLevel >= TIER_LEVEL.manager;

  // Feature permissions — derived from tier + department/role

  const canEditUsers = isAdmin; // owner, executive, admin, ops_manager

  const canAccessSettings = isAdmin;

  const canViewReports = isExecutive || isManager || isInDepartment(role, "finance", "sales");

  const canManageStock = isAdmin || isInDepartment(role, "warehouse", "purchasing");

  const canManageInvoices =
    isAdmin ||
    isInDepartment(role, "invoicing", "finance", "sales") ||
    role === "sales_manager";

  const canManageReceiving =
    isAdmin || isInDepartment(role, "warehouse", "purchasing");

  const canManageSalesmen = isAdmin || role === "sales_manager";

  const canManageCustomers =
    isAdmin || role === "sales_manager" || isInDepartment(role, "invoicing");

  const canImportExport =
    isAdmin || isInDepartment(role, "warehouse", "purchasing");

  const canUseVisualBuilder = isOwner;

  const canPreviewAsUser = isOwner || tier === "executive";

  return {
    role,
    tier,
    department,
    isOwner,
    isExecutive,
    isAdmin,
    isManager,
    canEditUsers,
    canAccessSettings,
    canViewReports,
    canManageStock,
    canManageInvoices,
    canManageReceiving,
    canManageSalesmen,
    canManageCustomers,
    canImportExport,
    canUseVisualBuilder,
    canPreviewAsUser,
  };
}

// Re-export helpers for use outside of React components (e.g., route config)
export { getTier, getDepartment, atLeast, TIER_MAP, DEPARTMENT_MAP };
