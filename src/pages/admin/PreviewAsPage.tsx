import { useMemo } from "react";
import { ArrowLeft, Eye, Check, X, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { useLang } from "@/contexts/LanguageContext";

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreviewAsPage() {
  const { canPreviewAsUser } = usePermissions();
  const { previewRole, setPreviewRole, isPreviewMode, exitPreview } = usePreviewMode();
  const navigate = useNavigate();
  const { role: realRole } = useAuth();
  const { t } = useLang();

  // ── Translated role groups ───────────────────────────────────────────────
  const ROLE_GROUPS = useMemo(() => [
    {
      dept: t("deptExecutive", "Executive"),
      accent: "text-amber-400",
      roles: [
        { key: "ceo",  label: t("role_ceo", "CEO"),            description: t("roleDesc_ceo", "Company-wide KPIs, strategic overview, all reports") },
        { key: "gm",   label: t("role_gm",  "General Manager"), description: t("roleDesc_gm",  "Operations oversight, approvals, full visibility")  },
      ],
    },
    {
      dept: t("deptOperations", "Operations"),
      accent: "text-blue-400",
      roles: [
        { key: "owner",       label: t("role_owner",       "Owner"),               description: t("roleDesc_owner",       "Full system control — all modules, admin tools, preview") },
        { key: "admin",       label: t("role_admin",       "Admin"),               description: t("roleDesc_admin",       "All modules, user management, import/export")            },
        { key: "ops_manager", label: t("role_ops_manager", "Operations Manager"),  description: t("roleDesc_ops_manager", "All modules except user management")                     },
      ],
    },
    {
      dept: t("deptSales", "Sales"),
      accent: "text-cyan-400",
      roles: [
        { key: "sales_manager", label: t("role_sales_manager", "Sales Manager"), description: t("roleDesc_sales_manager", "Team invoices, customers, salesmen, reports") },
        { key: "salesman",      label: t("role_salesman",      "Salesman"),       description: t("roleDesc_salesman",      "Own invoices, assigned customers")             },
        { key: "sales",         label: t("role_sales",         "Sales Staff"),    description: t("roleDesc_sales",         "Invoice entry and customer view")              },
      ],
    },
    {
      dept: t("deptWarehouseInventory", "Warehouse & Inventory"),
      accent: "text-emerald-400",
      roles: [
        { key: "warehouse_manager",    label: t("role_warehouse_manager",    "Warehouse Manager"),    description: t("roleDesc_warehouse_manager",    "Full warehouse: GRN, stock, products, import") },
        { key: "warehouse",            label: t("role_warehouse",            "Warehouse Staff"),      description: t("roleDesc_warehouse",            "GRN receiving and stock view")                 },
        { key: "inventory_controller", label: t("role_inventory_controller", "Inventory Controller"), description: t("roleDesc_inventory_controller", "Stock control, products, import/export")       },
        { key: "inventory",            label: t("role_inventory",            "Inventory Staff"),      description: t("roleDesc_inventory",            "View stock and products")                      },
        { key: "qc",                   label: t("role_qc",                   "Quality Control"),      description: t("roleDesc_qc",                   "GRN inspection and QC workflow")               },
      ],
    },
    {
      dept: t("deptFinanceAccounting", "Finance & Accounting"),
      accent: "text-violet-400",
      roles: [
        { key: "accountant", label: t("role_accountant", "Accountant"),      description: t("roleDesc_accountant", "Invoices, reports, financial view")   },
        { key: "accounting", label: t("role_accounting", "Accounting Staff"), description: t("roleDesc_accounting", "Invoices and financial records")       },
        { key: "cashier",    label: t("role_cashier",    "Cashier"),          description: t("roleDesc_cashier",    "Invoice entry and cash transactions")  },
      ],
    },
    {
      dept: t("deptPurchasing", "Purchasing"),
      accent: "text-orange-400",
      roles: [
        { key: "purchase_manager", label: t("role_purchase_manager", "Purchase Manager"), description: t("roleDesc_purchase_manager", "GRN, products, suppliers, import/export") },
        { key: "purchase",         label: t("role_purchase",         "Purchase Staff"),   description: t("roleDesc_purchase",         "GRN receiving and product view")           },
      ],
    },
    {
      dept: t("deptInvoicing", "Invoicing"),
      accent: "text-sky-400",
      roles: [
        { key: "invoice_team", label: t("role_invoice_team", "Invoice Team"), description: t("roleDesc_invoice_team", "Invoice creation, customer management, reports") },
      ],
    },
    {
      dept: t("deptMarketing", "Marketing"),
      accent: "text-pink-400",
      roles: [
        { key: "brand_manager", label: t("role_brand_manager", "Brand Manager"), description: t("roleDesc_brand_manager", "Product visibility and brand reporting") },
      ],
    },
    {
      dept: t("deptHrGeneral", "Human Resources & General"),
      accent: "text-muted-foreground",
      roles: [
        { key: "hr",        label: t("role_hr",        "HR"),        description: t("roleDesc_hr",        "General system view, no operational modules")       },
        { key: "secretary", label: t("role_secretary", "Secretary"), description: t("roleDesc_secretary", "Read-only access to reports and views")             },
        { key: "read_only", label: t("role_read_only", "Read Only"), description: t("roleDesc_read_only", "View-only: no create, edit, or delete actions")     },
      ],
    },
  ], [t]);

  // Guard — only admins/executives with canPreviewAsUser permission may access
  if (!canPreviewAsUser) {
    navigate("/unauthorized");
    return null;
  }

  const handleSelectRole = (role: string) => {
    setPreviewRole(role);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition text-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Eye className="w-4 h-4 text-amber-400 shrink-0" />
            <h1 className="text-[14px] font-semibold text-foreground truncate">
              {t("previewAsUser", "View as User")}
            </h1>
          </div>

          {isPreviewMode && (
            <button
              onClick={() => { exitPreview(); navigate("/"); }}
              className="flex items-center gap-1 text-xs text-amber-500 font-semibold hover:underline shrink-0"
            >
              <X className="w-3 h-3" />
              {t("exitPreview", "Exit Preview")}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* ── Info banner ────────────────────────────────────── */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("adminPreviewMode", "Admin Preview Mode")}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t("adminPreviewModeDesc", "Select any role to see exactly what that user sees — dashboards, navigation, permissions, and available actions. Your actual account and permissions are not changed.")}
              </p>
              {isPreviewMode && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-xs text-amber-400 font-semibold">
                    {t("currentlyPreviewing", "Currently previewing:")}
                    {" "}
                    <span className="font-mono uppercase">{previewRole}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Role groups ────────────────────────────────────── */}
        {ROLE_GROUPS.map(({ dept, accent, roles }) => (
          <div key={dept}>
            <h2 className={`text-[11px] font-semibold uppercase tracking-widest mb-2 px-1 ${accent}`}>
              {dept}
            </h2>

            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {roles.map(({ key, label, description }) => {
                const isCurrentPreview = previewRole === key;
                const isOwnRole = realRole === key;

                return (
                  <button
                    key={key}
                    onClick={() => !isOwnRole && handleSelectRole(key)}
                    disabled={isOwnRole}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition ${
                      isOwnRole
                        ? "opacity-40 cursor-not-allowed"
                        : isCurrentPreview
                          ? "bg-amber-500/5"
                          : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Active indicator dot */}
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                        isCurrentPreview ? "bg-amber-400" : "bg-border"
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
                    </div>

                    {isOwnRole && (
                      <span className="text-[10px] font-medium text-muted-foreground shrink-0 bg-muted/60 px-2 py-0.5 rounded">
                        {t("yourRole", "Your role")}
                      </span>
                    )}
                    {isCurrentPreview && !isOwnRole && (
                      <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {!isOwnRole && !isCurrentPreview && (
                      <Eye className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── Footer note ────────────────────────────────────── */}
        <p className="text-[11px] text-muted-foreground/50 text-center pb-2">
          {t("previewSessionNote", "Preview mode is session-only and not persisted. It resets on page refresh.")}
        </p>
      </main>
    </div>
  );
}
