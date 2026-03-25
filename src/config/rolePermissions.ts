import type { UserRole } from "../types/roles";

export const rolePermissions: Record<UserRole, string[]> = {
  admin: ["*"],

  ceo: [
    "dashboard.view",
    "reports.view",
    "sales.view",
    "inventory.view",
    "accounting.view",
    "users.view",
  ],

  gm: [
    "dashboard.view",
    "reports.view",
    "sales.view",
    "inventory.view",
    "accounting.view",
  ],

  sales_manager: [
    "dashboard.view",
    "reports.view",
    "sales.view",
    "sales.manage",
    "customers.view",
  ],

  sales: [
    "dashboard.view",
    "sales.view",
    "customers.view",
  ],

  inventory: [
    "dashboard.view",
    "inventory.view",
    "stock.view",
    "warehouse.view",
  ],

  accounting: [
    "dashboard.view",
    "accounting.view",
    "invoices.view",
    "payments.view",
  ],

  purchase: [
    "dashboard.view",
    "purchase.view",
    "suppliers.view",
  ],

  secretary: [
    "dashboard.view",
    "reports.view",
  ],

  invoice_team: [
    "dashboard.view",
    "invoices.view",
    "invoices.manage",
  ],

  hr: [
    "dashboard.view",
    "employees.view",
  ],
};