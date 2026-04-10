import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Users,
  BarChart3,
  UserSquare2,
  FileText,
  Plus,
  ScanLine,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchInvoiceStatusCounts,
  fetchReturnCounts,
  fetchSalesContext,
  enrichSalesmenWithInvoices,
  type InvoiceStatusCounts,
  type ReturnCounts,
  type SalesmanSummary,
} from "@/features/services/dashboardService";
import {
  DashboardShell,
  KpiGrid,
  SectionCard,
  ActionGrid,
  EmptyState,
  LoadingRows,
  StatusPill,
  type KpiItem,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Data hook ────────────────────────────────────────────────────────────────

interface SalesData {
  invoices: InvoiceStatusCounts;
  returns: ReturnCounts;
  customerCount: number;
  salesmen: SalesmanSummary[];
}

function useSalesData() {
  const [data, setData]   = useState<SalesData | null>(null);
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

      if (invoices && returns && ctx) {
        setData({
          invoices,
          returns,
          customerCount: ctx.customerCount,
          salesmen: enrichSalesmenWithInvoices(ctx.salesmen, (invoices.recent as any[])),
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
  sales_manager: "Sales Manager",
  salesman:      "Salesman",
  sales:         "Sales",
};

// ─── Actions ─────────────────────────────────────────────────────────────────

const ACTIONS: ActionItem[] = [
  {
    label: "New Invoice",
    path: "/invoice-entry",
    icon: Plus,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "Create invoice",
  },
  {
    label: "Invoice List",
    path: "/invoices",
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "All invoices",
  },
  {
    label: "Customers",
    path: "/customers",
    icon: Users,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Customer list",
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
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesDashboard() {
  const navigate  = useNavigate();
  const { role }  = usePermissions();
  const { data, loading } = useSalesData();

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const kpis: KpiItem[] = [
    {
      label: "Ready Invoices",
      value: data?.invoices.ready ?? "—",
      sub: "Awaiting execution",
      icon: ScanLine,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: "Done Today",
      value: data?.invoices.doneToday ?? "—",
      sub: "Delivered today",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
      trend: data?.invoices.doneToday ? "up" : "neutral",
    },
    {
      label: "Customers",
      value: data?.customerCount ?? "—",
      sub: "Total accounts",
      icon: Users,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
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
  ];

  return (
    <DashboardShell
      icon={ShoppingCart}
      title="Sales Dashboard"
      subtitle={`${roleLabel} · Invoices & Customer Activity`}
      accent="cyan"
      headerAction={
        <button
          onClick={() => navigate("/invoice-entry")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Invoice
        </button>
      }
    >
      <KpiGrid items={kpis} />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent invoices */}
        <SectionCard
          title="Recent Invoices"
          icon={FileText}
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
          {loading ? (
            <LoadingRows count={5} />
          ) : !data || data.invoices.recent.length === 0 ? (
            <EmptyState icon={FileText} message="No invoices yet" sub="Create the first invoice to see it here" />
          ) : (
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
          )}
        </SectionCard>

        {/* Salesman performance */}
        <SectionCard
          title="Salesman Performance"
          icon={UserSquare2}
          iconClass="text-cyan-400"
          action={
            <button
              onClick={() => navigate("/reports")}
              className="text-[10px] text-primary font-medium hover:underline"
            >
              Reports →
            </button>
          }
        >
          {loading ? (
            <LoadingRows count={4} />
          ) : !data || data.salesmen.length === 0 ? (
            <EmptyState icon={UserSquare2} message="No salesman data" sub="Invoice data will appear here as invoices are created" />
          ) : (
            <div className="space-y-2">
              {data.salesmen.slice(0, 6).map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.code ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-foreground">{s.invoiceCount}</p>
                    <p className="text-[9px] text-muted-foreground">invoices</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice status mini-summary */}
          {data && (
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-amber-400">{data.invoices.ready}</p>
                <p className="text-[9px] text-muted-foreground">Ready</p>
              </div>
              <div>
                <p className="text-base font-bold text-emerald-400">{data.invoices.done}</p>
                <p className="text-[9px] text-muted-foreground">Done</p>
              </div>
              <div>
                <p className="text-base font-bold text-violet-400">{data.returns.draft}</p>
                <p className="text-[9px] text-muted-foreground">Returns</p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
