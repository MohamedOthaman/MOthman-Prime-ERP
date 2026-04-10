import { usePermissions } from "@/hooks/usePermissions";

import OwnerDashboard       from "@/pages/dashboards/OwnerDashboard";
import AdminDashboard        from "@/pages/dashboards/AdminDashboard";
import ExecutiveDashboard    from "@/pages/dashboards/ExecutiveDashboard";
import WarehouseDashboard    from "@/pages/dashboards/WarehouseDashboard";
import QCDashboard           from "@/pages/dashboards/QCDashboard";
import PurchasingDashboard   from "@/pages/dashboards/PurchasingDashboard";
import SalesDashboard        from "@/pages/dashboards/SalesDashboard";
import InvoiceTeamDashboard  from "@/pages/dashboards/InvoiceTeamDashboard";
import AccountingDashboard   from "@/pages/dashboards/AccountingDashboard";
import DefaultDashboard      from "@/pages/dashboards/DefaultDashboard";

/**
 * DashboardRouter — picks the right dashboard for the active role.
 *
 * Resolution order (first match wins):
 *  1. owner tier              → OwnerDashboard         (super admin control panel)
 *  2. admin tier              → AdminDashboard          (full system operations)
 *  3. executive tier (ceo/gm) → ExecutiveDashboard      (company overview — adapts per role)
 *  4. qc role                 → QCDashboard             (inspection-first view)
 *  5. warehouse department    → WarehouseDashboard       (receiving, picking & stock)
 *  6. purchasing department   → PurchasingDashboard      (procurement & GRN)
 *  7. sales department        → SalesDashboard           (invoices & customers)
 *  8. invoicing department    → InvoiceTeamDashboard     (invoice workflow & processing)
 *  9. finance department      → AccountingDashboard      (financial review & oversight)
 * 10. fallback                → DefaultDashboard         (stock overview)
 *
 * Preview mode: usePermissions() returns the preview role's tier/department
 * automatically, so this router works correctly in preview mode without changes.
 */
export default function DashboardRouter() {
  const { tier, department, role } = usePermissions();

  // ── Tier-based routing (highest authority first) ──

  if (tier === "owner") {
    return <OwnerDashboard />;
  }

  if (tier === "admin") {
    return <AdminDashboard />;
  }

  if (tier === "executive") {
    return <ExecutiveDashboard />;
  }

  // ── Role-specific routing (before department, for precision) ──

  // QC gets its own specialised inspection dashboard
  if (role === "qc") {
    return <QCDashboard />;
  }

  // ── Department-based routing (manager and user tiers) ──

  if (department === "warehouse") {
    return <WarehouseDashboard />;
  }

  if (department === "purchasing") {
    return <PurchasingDashboard />;
  }

  if (department === "sales") {
    return <SalesDashboard />;
  }

  if (department === "invoicing") {
    return <InvoiceTeamDashboard />;
  }

  if (department === "finance") {
    return <AccountingDashboard />;
  }

  // ── Fallback — general staff, HR, marketing, secretary, read_only ──
  return <DefaultDashboard />;
}
