import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  TrendingUp,
  Boxes,
  ClipboardList,
  RotateCcw,
  FileText,
  Activity,
  Package,
  ThermometerSnowflake,
  Settings,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportEntry {
  title: string;
  description: string;
  path: string;
  /** If present, only shown to roles in this list (in addition to admin+) */
  allowedDepts?: string[];
}

interface ReportCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  /** If present, only shown when user is in one of these departments/tiers */
  showFor?: string[];
  reports: ReportEntry[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { department, isAdmin, isExecutive, isManager, role } = usePermissions();
  const { t } = useLang();

  const REPORT_CATALOG: ReportCategory[] = [
    {
      id: "invoices",
      label: t("invoices", "Invoices"),
      icon: FileText,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      showFor: ["invoicing", "finance", "sales", "operations", "executive"],
      reports: [
        {
          title: t("invoiceList", "Invoice List"),
          description: t("invoiceListDesc", "Full invoice lifecycle — all statuses with filters and lifecycle actions."),
          path: "/invoices",
        },
        {
          title: t("newInvoice", "New Invoice"),
          description: t("newInvoiceDesc", "Create a new sales invoice with product lines and customer assignment."),
          path: "/invoice-entry",
          allowedDepts: ["invoicing", "finance", "sales", "operations"],
        },
      ],
    },
    {
      id: "returns",
      label: t("returns", "Returns"),
      icon: RotateCcw,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      showFor: ["invoicing", "finance", "sales", "operations", "warehouse", "executive"],
      reports: [
        {
          title: t("returnsQueue", "Returns Queue"),
          description: t("returnsQueueDesc", "All pending and processed sales returns with batch linkage."),
          path: "/returns",
        },
      ],
    },
    {
      id: "sales",
      label: t("salesAndCustomers", "Sales & Customers"),
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      showFor: ["sales", "invoicing", "finance", "operations", "executive"],
      reports: [
        {
          title: t("salesPerformance", "Sales Performance"),
          description: t("salesPerformanceDesc", "Detailed sales analysis by salesman and period"),
          path: "/reports/sales",
          allowedDepts: ["sales", "finance", "operations", "executive"],
        },
        {
          title: t("customerAnalysis", "Customer Analysis"),
          description: t("customerAnalysisDesc", "Customer purchasing patterns and history"),
          path: "/reports/customers",
          allowedDepts: ["sales", "finance", "operations", "executive"],
        },
        {
          title: t("customersBySalesman", "Customers by Salesman"),
          description: t("customersBySalesmanDesc", "Each salesman with their assigned customers and activity status."),
          path: "/reports/customers-by-salesman",
        },
        {
          title: t("customersWithoutSalesman", "Customers Without Salesman"),
          description: t("customersWithoutSalesmanDesc", "Identify customers not assigned to any salesman."),
          path: "/reports/customers-without-salesman",
        },
        {
          title: t("customerList", "Customer List"),
          description: t("customerListDesc", "Full customer master list with contact and account details."),
          path: "/customers",
          allowedDepts: ["sales", "invoicing", "finance", "operations"],
        },
      ],
    },
    {
      id: "inventory",
      label: t("inventoryAndStock", "Inventory & Stock"),
      icon: Boxes,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      showFor: ["warehouse", "purchasing", "operations", "executive"],
      reports: [
        {
          title: t("stockReport", "Stock Report"),
          description: t("stockReportDesc", "Current inventory levels and movements"),
          path: "/reports/stock",
        },
        {
          title: t("expiryAlerts", "Expiry Alerts"),
          description: t("expiryAlertsDesc", "Products nearing or past expiry"),
          path: "/reports/expiry",
          allowedDepts: ["warehouse", "purchasing", "operations"],
        },
        {
          title: t("productPerformance", "Product Performance"),
          description: t("productPerformanceDesc", "Top and bottom performing products"),
          path: "/reports/products",
        },
        {
          title: t("stockOverview", "Stock Overview"),
          description: t("stockOverviewDesc", "Live stock levels by product, batch, storage type, and expiry."),
          path: "/stock",
        },
        {
          title: t("inventoryMovementsLedger", "Inventory Movements Ledger"),
          description: t("inventoryMovementsLedgerDesc", "Immutable movement log — inbound, outbound, returns, adjustments."),
          path: "/warehouse/movements",
          allowedDepts: ["warehouse", "purchasing", "operations"],
        },
        {
          title: t("coldStorageView", "Cold Storage View"),
          description: t("coldStorageViewDesc", "Frozen, Chilled, and Dry storage batches grouped by temperature zone with FEFO order."),
          path: "/warehouse/fridge",
          allowedDepts: ["warehouse", "purchasing", "operations"],
        },
      ],
    },
    {
      id: "receiving",
      label: t("receivingAndGRN", "Receiving & GRN"),
      icon: ClipboardList,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      showFor: ["warehouse", "purchasing", "operations", "executive"],
      reports: [
        {
          title: t("grnReceivingLog", "GRN / Receiving Log"),
          description: t("grnReceivingLogDesc", "All goods received notes with QC workflow, approval, and posting status."),
          path: "/grn",
        },
      ],
    },
    {
      id: "products",
      label: t("productsLabel", "Products"),
      icon: Package,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      showFor: ["warehouse", "purchasing", "operations", "executive"],
      reports: [
        {
          title: t("productMasterList", "Product Master List"),
          description: t("productMasterListDesc", "Full product catalogue with categories, barcodes, storage types, and pricing."),
          path: "/products",
          allowedDepts: ["warehouse", "purchasing", "operations"],
        },
      ],
    },
    {
      id: "admin",
      label: t("adminAndSettings", "Admin & Settings"),
      icon: Settings,
      color: "text-slate-400",
      bg: "bg-slate-500/10",
      border: "border-slate-500/20",
      showFor: ["operations", "executive"],
      reports: [
        {
          title: t("auditLog", "Audit Log"),
          description: t("auditLogDesc", "Full system activity log — all recorded actions, status changes, and user events."),
          path: "/audit",
          allowedDepts: ["operations", "executive"],
        },
        {
          title: t("systemSettings", "System Settings"),
          description: t("systemSettingsDesc", "Role permission matrix, navigation shortcuts, and system configuration."),
          path: "/admin/settings",
          allowedDepts: ["operations"],
        },
        {
          title: t("userManagement", "User Management"),
          description: t("userManagementDesc", "Invite users, assign roles, and manage account access."),
          path: "/admin/users",
          allowedDepts: ["operations"],
        },
      ],
    },
  ];

  function canSeeCategory(cat: ReportCategory): boolean {
    if (isAdmin) return true;
    if (!cat.showFor) return true;
    return cat.showFor.includes(department) || (isExecutive && cat.showFor.includes("executive"));
  }

  function canSeeEntry(entry: ReportEntry): boolean {
    if (isAdmin) return true;
    if (!entry.allowedDepts) return true;
    return entry.allowedDepts.includes(department);
  }

  const visibleCategories = REPORT_CATALOG
    .filter(canSeeCategory)
    .map((cat) => ({
      ...cat,
      reports: cat.reports.filter(canSeeEntry),
    }))
    .filter((cat) => cat.reports.length > 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3.5 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">{t("reportsTitle", "Reports")}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {visibleCategories.reduce((n, c) => n + c.reports.length, 0)} {t("reportEntries", "report entries")} · {t("liveData", "live data")}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        {visibleCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Activity className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("noReportsAvailable", "No reports available for your role")}</p>
          </div>
        ) : (
          visibleCategories.map((category) => {
            const Icon = category.icon;
            return (
              <section key={category.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${category.bg} border ${category.border}`}>
                    <Icon className={`h-3.5 w-3.5 ${category.color}`} />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">{category.label}</h2>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {category.reports.length} {category.reports.length !== 1 ? t("entries", "entries") : t("entry", "entry")}
                  </span>
                </div>

                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="divide-y divide-border">
                    {category.reports.map((report) => (
                      <button
                        key={report.path}
                        type="button"
                        onClick={() => navigate(report.path)}
                        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {report.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {report.description}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
