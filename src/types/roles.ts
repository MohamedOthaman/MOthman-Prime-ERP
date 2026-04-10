/**
 * All user roles that exist in the system (matching DB `profiles.role` values).
 * These are the REAL business roles — do not simplify or remove.
 */
export type UserRole =
  | "owner"
  | "admin"
  | "ceo"
  | "gm"
  | "ops_manager"
  | "sales_manager"
  | "salesman"
  | "sales"
  | "purchase_manager"
  | "brand_manager"
  | "accountant"
  | "accounting"
  | "invoice_team"
  | "inventory_controller"
  | "inventory"
  | "warehouse_manager"
  | "warehouse"
  | "cashier"
  | "secretary"
  | "purchase"
  | "hr"
  | "qc"
  | "read_only";

/**
 * Authority tiers — derived from role, determines permission level.
 * owner > executive > admin > manager > user
 */
export type RoleTier = "owner" | "executive" | "admin" | "manager" | "user";

/**
 * Business department — inferred from role in the frontend.
 * Determines dashboard focus, default data scope, and UI context.
 */
export type Department =
  | "executive"
  | "operations"
  | "sales"
  | "warehouse"
  | "purchasing"
  | "finance"
  | "invoicing"
  | "marketing"
  | "hr"
  | "general";