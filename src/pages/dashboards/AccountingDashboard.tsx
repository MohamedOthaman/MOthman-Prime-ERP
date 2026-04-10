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

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  accountant:   "Accountant",
  accounting:   "Accounting",
  cashier:      "Cashier",
};

// ─── Actions ─────────────────────────────────────────────────────────────────

const ACTIONS: ActionItem[] = [
  {
    label: "Invoice List",
    path: "/invoices",
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "Review all invoices",
  },
  {
    label: "Returns",
    path: "/returns",
    icon: RotateCcw,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    description: "Process returns",
  },
  {
    label: "Customers",
    path: "/customers",
    icon: Users,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Customer accounts",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: BarChart3,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    description: "Financial reports",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountingDashboard() {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const { data, loading } = useAccountingData();

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const kpis: KpiItem[] = [
    {
      label: "Done Today",
      value: data?.invoices.doneToday ?? "—",
      sub: "Invoices executed today",
      icon: TrendingDown,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
      trend: data?.invoices.doneToday ? "up" : "neutral",
    },
    {
      label: "Ready",
      value: data?.invoices.ready ?? "—",
      sub: "Awaiting execution",
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: "Pending Returns",
      value: data?.returns.draft ?? "—",
      sub: "Awaiting processing",
      icon: RotateCcw,
      color: data?.returns.draft ? "text-violet-500" : "text-muted-foreground",
      bg: data?.returns.draft ? "bg-violet-500/10" : "bg-muted/20",
      border: data?.returns.draft ? "border-violet-500/20" : "border-border",
      loading,
    },
    {
      label: "Cancelled",
      value: data?.invoices.cancelled ?? "—",
      sub: "Requires review",
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
      title="Accounting Dashboard"
      subtitle={`${roleLabel} · Financial Review & Invoice Oversight`}
      accent="blue"
      headerAction={
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Reports
        </button>
      }
    >
      <KpiGrid items={kpis} />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Invoice financial summary */}
        <SectionCard
          title="Invoice Breakdown"
          icon={Receipt}
          iconClass="text-blue-400"
          action={
            <button
              onClick={() => navigate("/invoices")}
              className="text-[10px] text-primary font-medium hover:underline"
            >
              View all →
            </button>
          }
        >
          <PipelineBar
            rows={[
              { label: "Draft",     count: data?.invoices.draft    ?? 0, bar: "bg-muted-foreground/30", text: "text-muted-foreground" },
              { label: "Ready",     count: data?.invoices.ready    ?? 0, bar: "bg-amber-500",           text: "text-amber-400" },
              { label: "Done",      count: data?.invoices.done     ?? 0, bar: "bg-emerald-500",         text: "text-emerald-400" },
              { label: "Received",  count: data?.invoices.received ?? 0, bar: "bg-blue-500",            text: "text-blue-400" },
              { label: "Cancelled", count: data?.invoices.cancelled ?? 0, bar: "bg-red-500",            text: "text-red-400" },
              { label: "Returns",   count: data?.invoices.returns  ?? 0, bar: "bg-violet-500",          text: "text-violet-400" },
            ] satisfies PipelineRow[]}
            total={data?.invoices.total ?? 0}
            loading={loading}
          />

          <div className="pt-3 border-t border-border grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-foreground">{loading ? "…" : data?.invoices.total ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Total invoices</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{loading ? "…" : data?.customerCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Customers</p>
            </div>
          </div>
        </SectionCard>

        {/* Returns & recent invoices */}
        <SectionCard
          title="Recent Invoices"
          icon={FileText}
          iconClass="text-blue-400"
        >
          {loading ? (
            <LoadingRows count={5} />
          ) : !data || data.invoices.recent.length === 0 ? (
            <EmptyState icon={FileText} message="No invoices yet" sub="Invoices will appear here once created" />
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

              {/* Returns summary footer */}
              {data.returns && (
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold text-violet-400">{data.returns.draft}</p>
                    <p className="text-[9px] text-muted-foreground">Pending</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-emerald-400">{data.returns.received}</p>
                    <p className="text-[9px] text-muted-foreground">Processed</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-red-400">{data.returns.cancelled}</p>
                    <p className="text-[9px] text-muted-foreground">Cancelled</p>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      {/* Financial placeholders (no real data yet) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Customer Balances",    sub: "AR overview",         color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: Users },
          { label: "Payment Receipts",     sub: "Payments received",   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2 },
          { label: "Outstanding Invoices", sub: "Awaiting collection", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: Clock },
        ].map(({ label, sub, color, bg, border, icon: Icon }) => (
          <div key={label} className={`rounded-xl border ${border} ${bg} p-4 opacity-60`}>
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
            <p className="text-[9px] text-muted-foreground mt-1 italic">Coming soon</p>
          </div>
        ))}
      </div>

      <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
