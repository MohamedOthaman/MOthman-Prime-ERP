import { ArrowLeft, Eye, Check, X, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { useAuth } from "@/features/reports/hooks/useAuth";

// ─── Role catalogue ────────────────────────────────────────────────────────────

const ROLE_GROUPS = [
  {
    dept: "Executive",
    accent: "text-amber-400",
    roles: [
      { key: "ceo", label: "CEO", description: "Company-wide KPIs, strategic overview, all reports" },
      { key: "gm", label: "General Manager", description: "Operations oversight, approvals, full visibility" },
    ],
  },
  {
    dept: "Operations",
    accent: "text-blue-400",
    roles: [
      { key: "owner", label: "Owner", description: "Full system control — all modules, admin tools, preview" },
      { key: "admin", label: "Admin", description: "All modules, user management, import/export" },
      { key: "ops_manager", label: "Operations Manager", description: "All modules except user management" },
    ],
  },
  {
    dept: "Sales",
    accent: "text-cyan-400",
    roles: [
      { key: "sales_manager", label: "Sales Manager", description: "Team invoices, customers, salesmen, reports" },
      { key: "salesman", label: "Salesman", description: "Own invoices, assigned customers" },
      { key: "sales", label: "Sales Staff", description: "Invoice entry and customer view" },
    ],
  },
  {
    dept: "Warehouse & Inventory",
    accent: "text-emerald-400",
    roles: [
      { key: "warehouse_manager", label: "Warehouse Manager", description: "Full warehouse: GRN, stock, products, import" },
      { key: "warehouse", label: "Warehouse Staff", description: "GRN receiving and stock view" },
      { key: "inventory_controller", label: "Inventory Controller", description: "Stock control, products, import/export" },
      { key: "inventory", label: "Inventory Staff", description: "View stock and products" },
      { key: "qc", label: "Quality Control", description: "GRN inspection and QC workflow" },
    ],
  },
  {
    dept: "Finance & Accounting",
    accent: "text-violet-400",
    roles: [
      { key: "accountant", label: "Accountant", description: "Invoices, reports, financial view" },
      { key: "accounting", label: "Accounting Staff", description: "Invoices and financial records" },
      { key: "cashier", label: "Cashier", description: "Invoice entry and cash transactions" },
    ],
  },
  {
    dept: "Purchasing",
    accent: "text-orange-400",
    roles: [
      { key: "purchase_manager", label: "Purchase Manager", description: "GRN, products, suppliers, import/export" },
      { key: "purchase", label: "Purchase Staff", description: "GRN receiving and product view" },
    ],
  },
  {
    dept: "Invoicing",
    accent: "text-sky-400",
    roles: [
      { key: "invoice_team", label: "Invoice Team", description: "Invoice creation, customer management, reports" },
    ],
  },
  {
    dept: "Marketing",
    accent: "text-pink-400",
    roles: [
      { key: "brand_manager", label: "Brand Manager", description: "Product visibility and brand reporting" },
    ],
  },
  {
    dept: "Human Resources & General",
    accent: "text-muted-foreground",
    roles: [
      { key: "hr", label: "HR", description: "General system view, no operational modules" },
      { key: "secretary", label: "Secretary", description: "Read-only access to reports and views" },
      { key: "read_only", label: "Read Only", description: "View-only: no create, edit, or delete actions" },
    ],
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreviewAsPage() {
  const { canPreviewAsUser } = usePermissions();
  const { previewRole, setPreviewRole, isPreviewMode, exitPreview } = usePreviewMode();
  const navigate = useNavigate();
  const { role: realRole } = useAuth();

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
            <h1 className="text-[14px] font-semibold text-foreground truncate">View as User</h1>
          </div>

          {isPreviewMode && (
            <button
              onClick={() => { exitPreview(); navigate("/"); }}
              className="flex items-center gap-1 text-xs text-amber-500 font-semibold hover:underline shrink-0"
            >
              <X className="w-3 h-3" />
              Exit Preview
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
              <p className="text-sm font-semibold text-foreground">Admin Preview Mode</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Select any role to see exactly what that user sees — dashboards, navigation,
                permissions, and available actions. Your actual account and permissions are
                not changed.
              </p>
              {isPreviewMode && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-xs text-amber-400 font-semibold">
                    Currently previewing:{" "}
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
                        Your role
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
          Preview mode is session-only and not persisted. It resets on page refresh.
        </p>
      </main>
    </div>
  );
}
