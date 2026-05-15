import { useEffect, useState } from "react";
import {
  DollarSign,
  FileText,
  Receipt,
  XCircle,
  RotateCcw,
  BarChart3,
  CheckCircle2,
  Clock,
  TrendingDown,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";
import {
  fetchInvoiceStatusCounts,
  fetchReturnCounts,
  fetchSalesContext,
  type InvoiceStatusCounts,
  type ReturnCounts,
} from "@/features/services/dashboardService";
import {
  DashboardShell,
  KpiGrid,
  SectionCard,
  ActionGrid,
  EmptyState,
  LoadingRows,
  StatusPill,
  PipelineBar,
  type PipelineRow,
  type KpiItem,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Data hook ────────────────────────────────────────────────────────────────

interface AccountingData {
  invoices: InvoiceStatusCounts;
  returns: ReturnCounts;
  customerCount: number;
  totalRevenue: number;
}

function useAccountingData() {
  const [data, setData]     = useState<AccountingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [invRes, retRes, ctxRes] = await Promise.allSettled([
        fetchInvoiceStatusCounts(),
        fetchReturnCounts(),
        fetchSalesContext(),
      ]);

      const invoices = invRes.status === "fulfilled" ? invRes.value : null;
      const returns  = retRes.status === "fulfilled" ? retRes.value : null;
      const ctx      = ctxRes.status === "fulfilled" ? ctxRes.value : null;

      if (invoices && returns) {
        // Derive total revenue from recent invoices (approximation from sample)
        const totalRevenue = invoices.recent.reduce((sum, inv) => sum + inv.total_amount, 0);
        setData({
          invoices,
          returns,
          customerCount: ctx?.customerCount ?? 0,
          totalRevenue,
        });
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { data, loading };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountingDashboard() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { role } = usePermissions();
  const { data, loading } = useAccountingData();

  const ROLE_LABELS: Record<string, string> = {
    accountant: t("roleAccountant", "Accountant"),
    accounting: t("roleAccounting", "Accounting"),
    cashier:    t("roleCashier", "Cashier"),
  };

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const actions: ActionItem[] = [
    { label: t("invoiceList", "Invoice List"), path: "/invoices",  icon: FileText, color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   description: t("reviewAllInvoices", "Review all invoices") },
    { label: t("pageTitleReturns", "Returns"), path: "/returns",   icon: RotateCcw, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", description: t("processReturns", "Process returns") },
    { label: t("customersNav", "Customers"),   path: "/customers", icon: Users,    color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/20",   description: t("customerAccounts", "Customer accounts") },
    { label: t("reports", "Reports"),          path: "/reports",   icon: BarChart3, color: "text-amber-400", bg: "bg-amber-500/10",  border: "border-amber-500/20",  description: t("financialReports", "Financial reports") },
  ];

  const kpis: KpiItem[] = [
    {
      label: t("doneToday", "Done Today"),
      value: data?.invoices.doneToday ?? "—",
      sub: t("invoicesExecutedToday", "Invoices executed today"),
      icon: TrendingDown,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
      trend: data?.invoices.doneToday ? "up" : "neutral",
    },
    {
      label: t("ready", "Ready"),
      value: data?.invoices.ready ?? "—",
      sub: t("awaitingExecution", "Awaiting execution"),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: t("pendingReturns", "Pending Returns"),
      value: data?.returns.draft ?? "—",
      sub: t("awaitingProcessing", "Awaiting processing"),
      icon: RotateCcw,
      color: data?.returns.draft ? "text-violet-500" : "text-muted-foreground",
      bg: data?.returns.draft ? "bg-violet-500/10" : "bg-muted/20",
      border: data?.returns.draft ? "border-violet-500/20" : "border-border",
      loading,
    },
    {
      label: t("cancelled", "Cancelled"),
      value: data?.invoices.cancelled ?? "—",
      sub: t("requiresReview", "Requires review"),
      icon: XCircle,
      color: data?.invoices.cancelled ? "text-red-500" : "text-muted-foreground",
      bg: data?.invoices.cancelled ? "bg-red-500/10" : "bg-muted/20",
      border: data?.invoices.cancelled ? "border-red-500/20" : "border-border",
      loading,
    },
  ];

  return (
    <DashboardShell
      icon={DollarSign}
      title={t("accountingDashboard", "Accounting Dashboard")}
      subtitle={`${roleLabel} · ${t("financialReviewSubtitle", "Financial Review & Invoice Oversight")}`}
      accent="blue"
      headerAction={
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {t("reports", "Reports")}
        </button>
      }
    >
      <KpiGrid items={kpis} />

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard
          title={t("invoiceBreakdown", "Invoice Breakdown")}
          icon={Receipt}
          iconClass="text-blue-400"
          action={
            <button
              onClick={() => navigate("/invoices")}
              className="text-[10px] text-primary font-medium hover:underline"
            >
              {t("viewAll", "View all →")}
            </button>
          }
        >
          <PipelineBar
            rows={[
              { label: t("draft", "Draft"),     count: data?.invoices.draft    ?? 0, bar: "bg-muted-foreground/30", text: "text-muted-foreground" },
              { label: t("ready", "Ready"),     count: data?.invoices.ready    ?? 0, bar: "bg-amber-500",           text: "text-amber-400" },
              { label: t("done", "Done"),       count: data?.invoices.done     ?? 0, bar: "bg-emerald-500",         text: "text-emerald-400" },
              { label: t("received", "Received"), count: data?.invoices.received ?? 0, bar: "bg-blue-500",          text: "text-blue-400" },
              { label: t("cancelled", "Cancelled"), count: data?.invoices.cancelled ?? 0, bar: "bg-red-500",        text: "text-red-400" },
              { label: t("pageTitleReturns", "Returns"), count: data?.invoices.returns ?? 0, bar: "bg-violet-500", text: "text-violet-400" },
            ] satisfies PipelineRow[]}
            total={data?.invoices.total ?? 0}
            loading={loading}
          />

          <div className="pt-3 border-t border-border grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">{loading ? "…" : data?.invoices.total ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{t("totalInvoicesCount", "Total invoices")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{loading ? "…" : data?.customerCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">{t("customersNav", "Customers")}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t("recentInvoices", "Recent Invoices")}
          icon={FileText}
          iconClass="text-blue-400"
        >
          {loading ? (
            <LoadingRows count={5} />
          ) : !data || data.invoices.recent.length === 0 ? (
            <EmptyState icon={FileText} message={t("noInvoicesYet", "No invoices yet")} sub={t("invoicesWillAppear", "Invoices will appear here once created")} />
          ) : (
            <>
              <div className="space-y-1.5">
                {data.invoices.recent.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="w-full flex items-center gap-3 rounded-lg bg-muted/30 hover:bg-muted/50 px-3 py-2.5 transition text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {inv.invoice_no ?? `INV ${inv.id.slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString()}
                        {inv.total_amount > 0 && ` · AED ${inv.total_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </p>
                    </div>
                    <StatusPill status={inv.status} />
                  </button>
                ))}
              </div>

              {data.returns && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold text-violet-400">{data.returns.draft}</p>
                    <p className="text-[9px] text-muted-foreground">{t("pending", "Pending")}</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-emerald-400">{data.returns.received}</p>
                    <p className="text-[9px] text-muted-foreground">{t("processed", "Processed")}</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-red-400">{data.returns.cancelled}</p>
                    <p className="text-[9px] text-muted-foreground">{t("cancelled", "Cancelled")}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: t("customerBalances", "Customer Balances"),      sub: t("arOverview", "AR overview"),            color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Users },
          { label: t("paymentReceipts", "Payment Receipts"),        sub: t("paymentsReceived", "Payments received"), color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
          { label: t("outstandingInvoices", "Outstanding Invoices"),sub: t("awaitingCollection", "Awaiting collection"), color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20",   icon: Clock },
        ].map(({ label, sub, color, bg, border, icon: Icon }) => (
          <div key={label} className={`rounded-xl border ${border} ${bg} p-4 opacity-60`}>
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
            <p className="text-[9px] text-muted-foreground mt-1 italic">{t("comingSoon", "Coming soon")}</p>
          </div>
        ))}
      </div>

      <ActionGrid actions={actions} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
