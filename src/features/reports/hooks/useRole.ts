import { useAuth } from "@/features/reports/hooks/useAuth";

export function useRole() {
  const { role } = useAuth();

  return {
    role,
    isAdmin: role === "admin",
    isSalesManager: role === "sales_manager",
    canManageStock: [
      "admin",
      "ops_manager",
      "inventory_controller",
      "warehouse",
      "purchase_manager",
    ].includes(role),
    canManageInvoices: [
      "admin",
      "ceo",
      "gm",
      "ops_manager",
      "sales_manager",
      "accountant",
      "invoice_team",
    ].includes(role),
  };
}