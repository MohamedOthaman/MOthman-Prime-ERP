/**
 * @deprecated Use `usePermissions` from `@/hooks/usePermissions` instead.
 * This re-exports a backward-compatible subset so existing consumers
 * (BottomNav, SalesmenPage, SalesmanForm, CustomersPage) keep working
 * without import changes.
 */
import { usePermissions } from "@/hooks/usePermissions";

export function useRole() {
  const p = usePermissions();

  return {
    role: p.role,
    isAdmin: p.isAdmin,
    isSalesManager: p.role === "sales_manager",
    canManageStock: p.canManageStock,
    canManageInvoices: p.canManageInvoices,
  };
}