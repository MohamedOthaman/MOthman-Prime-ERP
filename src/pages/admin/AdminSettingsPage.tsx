/**
 * AdminSettingsPage — operational settings + permission matrix.
 * Route: /admin/settings  (admin / ops_manager only)
 *
 * Sections:
 *   1. System overview (project, version, environment)
 *   2. Role permission matrix (read-only reference)
 *   3. Navigation — quick links to admin sub-pages
 *   4. Danger zone placeholder (reserved)
 */

import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import {
  ArrowLeft,
  Settings,
  Shield,
  Users,
  Eye,
  LayoutDashboard,
  ClipboardList,
  Layers,
  FileText,
  BarChart3,
  Package,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Info,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";

// ─── Role permission matrix data ──────────────────────────────────────────────

interface RoleEntry {
  role: string;
  label: string;
  dept: string;
  tier: "owner" | "executive" | "admin" | "manager" | "user";
  permissions: {
    canViewReports: boolean;
    canManageStock: boolean;
    canManageInvoices: boolean;
    canManageReceiving: boolean;
    canManageCustomers: boolean;
    canImportExport: boolean;
    canEditUsers: boolean;
  };
}

// Static data — labels translated inside component via useMemo
const ROLE_MATRIX_DATA: Omit<RoleEntry, "label" | "dept">[] = [
  { role: "admin",              tier: "admin",     permissions: { canViewReports: true,  canManageStock: true,  canManageInvoices: true,  canManageReceiving: true,  canManageCustomers: true,  canImportExport: true,  canEditUsers: true  } },
  { role: "ops_manager",        tier: "admin",     permissions: { canViewReports: true,  canManageStock: true,  canManageInvoices: true,  canManageReceiving: true,  canManageCustomers: true,  canImportExport: true,  canEditUsers: true  } },
  { role: "ceo",                tier: "executive", permissions: { canViewReports: true,  canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: false, canImportExport: false, canEditUsers: true  } },
  { role: "gm",                 tier: "executive", permissions: { canViewReports: true,  canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: false, canImportExport: false, canEditUsers: true  } },
  { role: "sales_manager",      tier: "manager",   permissions: { canViewReports: true,  canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: true,  canImportExport: false, canEditUsers: false } },
  { role: "salesman",           tier: "user",      permissions: { canViewReports: false, canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: false, canImportExport: false, canEditUsers: false } },
  { role: "invoice_team",       tier: "user",      permissions: { canViewReports: false, canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: true,  canImportExport: false, canEditUsers: false } },
  { role: "accountant",         tier: "user",      permissions: { canViewReports: true,  canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: false, canImportExport: false, canEditUsers: false } },
  { role: "cashier",            tier: "user",      permissions: { canViewReports: true,  canManageStock: false, canManageInvoices: true,  canManageReceiving: false, canManageCustomers: false, canImportExport: false, canEditUsers: false } },
  { role: "warehouse_manager",  tier: "manager",   permissions: { canViewReports: true,  canManageStock: true,  canManageInvoices: false, canManageReceiving: true,  canManageCustomers: false, canImportExport: true,  canEditUsers: false } },
  { role: "inventory_controller", tier: "manager", permissions: { canViewReports: true,  canManageStock: true,  canManageInvoices: false, canManageReceiving: true,  canManageCustomers: false, canImportExport: true,  canEditUsers: false } },
  { role: "warehouse",          tier: "user",      permissions: { canViewReports: false, canManageStock: true,  canManageInvoices: false, canManageReceiving: true,  canManageCustomers: false, canImportExport: false, canEditUsers: false } },
  { role: "qc",                 tier: "user",      permissions: { canViewReports: false, canManageStock: false, canManageInvoices: false, canManageReceiving: true,  canManageCustomers: false, canImportExport: false, canEditUsers: false } },
  { role: "purchase_manager",   tier: "manager",   permissions: { canViewReports: true,  canManageStock: true,  canManageInvoices: false, canManageReceiving: true,  canManageCustomers: false, canImportExport: true,  canEditUsers: false } },
];

const TIER_COLOR: Record<string, string> = {
  owner:     "text-violet-400 bg-violet-500/10 border-violet-500/20",
  executive: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  admin:     "text-red-400 bg-red-500/10 border-red-500/20",
  manager:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
  user:      "text-muted-foreground bg-muted/30 border-border",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const { role, tier } = usePermissions();
  const { t } = useLang();

  // ── Translated role matrix ───────────────────────────────────────────────
  const ROLE_MATRIX = useMemo<RoleEntry[]>(() => {
    const labelMap: Record<string, [string, string]> = {
      admin:                ["Admin",            "Operations"],
      ops_manager:          ["Ops Manager",      "Operations"],
      ceo:                  ["CEO",              "Executive"],
      gm:                   ["GM",               "Executive"],
      sales_manager:        ["Sales Manager",    "Sales"],
      salesman:             ["Salesman",         "Sales"],
      invoice_team:         ["Invoice Team",     "Invoicing"],
      accountant:           ["Accountant",       "Finance"],
      cashier:              ["Cashier",          "Finance"],
      warehouse_manager:    ["Warehouse Manager","Warehouse"],
      inventory_controller: ["Inv. Controller",  "Warehouse"],
      warehouse:            ["Warehouse Staff",  "Warehouse"],
      qc:                   ["QC",               "Warehouse"],
      purchase_manager:     ["Purchase Manager", "Purchasing"],
    };
    return ROLE_MATRIX_DATA.map((r) => {
      const [defaultLabel, defaultDept] = labelMap[r.role] ?? [r.role, "General"];
      return {
        ...r,
        label: t(`role_${r.role}`, defaultLabel),
        dept: t(`dept_${r.role}_dept`, defaultDept),
      } as RoleEntry;
    });
  }, [t]);

  // ── Translated permission columns ────────────────────────────────────────
  const PERMISSION_COLS = useMemo<{ key: keyof RoleEntry["permissions"]; label: string }[]>(() => [
    { key: "canViewReports",     label: t("permReports",   "Reports")   },
    { key: "canManageStock",     label: t("permStock",     "Stock")     },
    { key: "canManageInvoices",  label: t("permInvoices",  "Invoices")  },
    { key: "canManageReceiving", label: t("permReceiving", "Receiving") },
    { key: "canManageCustomers", label: t("permCustomers", "Customers") },
    { key: "canImportExport",    label: t("permImport",    "Import")    },
    { key: "canEditUsers",       label: t("users",         "Users")     },
  ], [t]);

  const ADMIN_LINKS = [
    { icon: Users,           label: t("userManagement", "User Management"),      sub: t("inviteUsersDesc", "Invite users, assign roles, reset access"),    path: "/admin/users"        },
    { icon: Eye,             label: t("previewAsRole", "Preview As Role"),        sub: t("previewAsRoleDesc", "View the app as any role (admin only)"),      path: "/admin/preview-as"   },
    { icon: LayoutDashboard, label: t("dashboard", "Dashboard"),                  sub: t("returnDashboard", "Return to your home dashboard"),                path: "/"                   },
    { icon: BarChart3,       label: t("reports", "Reports"),                      sub: t("accessReports", "Access the reports catalog"),                    path: "/reports"            },
    { icon: Package,         label: t("productsNav", "Products"),                 sub: t("productMasterDesc", "Product master, import & validation"),        path: "/products"           },
    { icon: ClipboardList,   label: t("pageTitleGrn", "GRN List"),               sub: t("grnListDesc", "Goods received notes & receiving queue"),            path: "/grn"                },
    { icon: FileText,        label: t("pageTitleInvoices", "Invoice List"),       sub: t("invoiceListDesc", "Sales invoices lifecycle"),                     path: "/invoices"           },
    { icon: Layers,          label: t("inventoryMovements", "Inventory Movements"), sub: t("inventoryMovementsDesc", "Full movement audit ledger"),          path: "/warehouse/movements" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-500/10 border border-slate-500/20 shrink-0">
            <Settings className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">{t("pageTitleSettings", "System Settings")}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Admin · {role.replace(/_/g, " ")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-5">

        {/* System overview */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t("systemInfo", "System Information")}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-xs">
            {[
              { label: t("application", "Application"),  value: "Food Choice ERP" },
              { label: t("stack", "Stack"),              value: "React · TypeScript · Supabase" },
              { label: t("yourRole", "Your Role"),       value: role.replace(/_/g, " ") },
              { label: t("authority", "Authority"),      value: tier },
              { label: t("dataSource", "Data source"),   value: "Supabase PostgreSQL" },
              { label: t("authSystem", "Auth"),          value: "Supabase Auth + RLS" },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-foreground capitalize">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick navigation */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
            <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t("quickNav", "Quick Navigation")}</h2>
          </div>
          <div className="divide-y divide-border/40">
            {ADMIN_LINKS.map(({ icon: Icon, label, sub, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/20 transition text-left"
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/40 shrink-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        </section>

        {/* Role permission matrix */}
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <h2 className="text-sm font-semibold text-foreground">{t("rolePermMatrix", "Role Permission Matrix")}</h2>
            <span className="ml-auto text-[10px] text-muted-foreground">{t("readOnlyRef", "Read-only reference")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium min-w-[140px]">{t("tableRole", "Role")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("deptCol", "Dept")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("tierCol", "Tier")}</th>
                  {PERMISSION_COLS.map((col) => (
                    <th key={col.key} className="px-2 py-2 text-center font-medium whitespace-nowrap">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLE_MATRIX.map((entry) => (
                  <tr
                    key={entry.role}
                    className={`border-t border-border/40 ${entry.role === role ? "bg-primary/5" : "hover:bg-muted/10"}`}
                  >
                    <td className="px-4 py-2">
                      <span className="font-medium text-foreground">
                        {entry.label}
                        {entry.role === role && (
                          <span className="ml-1.5 text-[9px] font-bold text-primary uppercase tracking-wide">{t("youLabel", "you")}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{entry.dept}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TIER_COLOR[entry.tier]}`}>
                        {entry.tier}
                      </span>
                    </td>
                    {PERMISSION_COLS.map((col) => (
                      <td key={col.key} className="px-2 py-2 text-center">
                        {entry.permissions[col.key] ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground/30 inline" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Danger zone placeholder */}
        <section className="rounded-xl border border-red-500/20 bg-red-500/3 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">{t("dangerZone", "Danger Zone")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dangerZoneDesc", "Destructive operations (data purge, schema resets, bulk role changes) are managed directly via Supabase dashboard or CLI migration. Contact your system administrator.")}
          </p>
        </section>

      </main>
    </div>
  );
}
