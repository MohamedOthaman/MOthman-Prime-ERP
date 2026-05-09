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
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";

type Tab = { path: string; icon: React.ComponentType<{ className?: string }>; label: string };

/**
 * BottomNav — 5-slot adaptive navigation bar.
 *
 * Slot assignment by department/role:
 *   1. Home (always)
 *   2. Primary workflow entry point for the role
 *   3. Secondary workflow entry point
 *   4. Reports or Returns (depending on role)
 *   5. Power action / admin / stock
 */
export function BottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { t }     = useLang();
  const {
    canManageInvoices,
    canManageReceiving,
    canImportExport,
    canViewReports,
    canManageStock,
    canEditUsers,
    isOwner,
    department,
    role,
  } = usePermissions();

  const tabs: Tab[] = [
    { path: "/", icon: LayoutDashboard, label: t("home") ?? "Home" },
  ];

  // ── Slot 2: primary workflow ──────────────────────────────────────────────

  if (role === "qc") {
    // QC: primary action is GRN inspection, not picking
    tabs.push({ path: "/grn", icon: ClipboardList, label: "GRN" });
  } else if (department === "warehouse") {
    // Warehouse: primary action is picking
    tabs.push({ path: "/warehouse/picking", icon: ScanLine, label: "Picking" });
  } else if (department === "purchasing") {
    tabs.push({ path: "/grn", icon: ClipboardList, label: "GRN" });
  } else if (canManageInvoices) {
    tabs.push({ path: "/invoices", icon: FileText, label: t("invoices") ?? "Invoices" });
  } else if (canManageReceiving) {
    tabs.push({ path: "/grn", icon: ClipboardList, label: "GRN" });
  }

  // ── Slot 3: secondary workflow ────────────────────────────────────────────

  if (role === "qc") {
    // QC slot 3: stock view
    tabs.push({ path: "/stock", icon: Package, label: "Stock" });
  } else if (department === "warehouse") {
    tabs.push({ path: "/returns", icon: RotateCcw, label: "Returns" });
  } else if (department === "purchasing") {
    tabs.push({ path: "/warehouse/movements", icon: Activity, label: "Movements" });
  } else if (canManageInvoices && canManageReceiving) {
    // Admin/ops: show GRN in slot 3 (invoices already in slot 2)
    tabs.push({ path: "/grn", icon: ClipboardList, label: "GRN" });
  } else if (canManageInvoices && !canManageReceiving) {
    // Invoice team / sales / finance: returns in slot 3
    tabs.push({ path: "/returns", icon: RotateCcw, label: "Returns" });
  } else if (canImportExport && !canManageReceiving) {
    tabs.push({ path: "/import-export", icon: FileSpreadsheet, label: t("io") ?? "I/O" });
  }

  // ── Slot 4: reports or movements ─────────────────────────────────────────

  if (canViewReports) {
    tabs.push({ path: "/reports", icon: BarChart3, label: t("reports") ?? "Reports" });
  } else if (department === "warehouse") {
    tabs.push({ path: "/warehouse/movements", icon: Activity, label: "Movements" });
  } else if (canManageReceiving) {
    tabs.push({ path: "/returns", icon: RotateCcw, label: "Returns" });
  }

  // ── Slot 5: power action ─────────────────────────────────────────────────

  if (isOwner) {
    tabs.push({ path: "/owner", icon: Settings, label: "Control" });
  } else if (canEditUsers) {
    tabs.push({ path: "/admin/users", icon: Settings, label: "Admin" });
  } else if (canManageStock) {
    tabs.push({ path: "/stock", icon: Package, label: t("stock") ?? "Stock" });
  } else if (department === "warehouse" || department === "purchasing") {
    tabs.push({ path: "/stock", icon: Package, label: t("stock") ?? "Stock" });
  } else if (canImportExport && canManageReceiving) {
    tabs.push({ path: "/import-export", icon: FileSpreadsheet, label: t("io") ?? "I/O" });
  } else {
    tabs.push({ path: "/stock", icon: Package, label: t("stock") ?? "Stock" });
  }

  // ── Deduplicate + cap at 5 ────────────────────────────────────────────────

  const unique: Tab[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    if (!seen.has(tab.path)) { unique.push(tab); seen.add(tab.path); }
  }
  const final = unique.slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur">
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: `repeat(${final.length}, minmax(0, 1fr))` }}
      >
        {final.map((tab) => {
          const active =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate max-w-[56px]">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
