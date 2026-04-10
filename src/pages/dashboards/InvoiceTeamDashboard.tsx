import { useEffect, useState } from "react";
import {
  FileText,
  ScanLine,
  CheckCircle2,
  RotateCcw,
  Plus,
  Clock,
  XCircle,
  Receipt,
  TrendingUp,
  ListChecks,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  fetchInvoiceStatusCounts,
  fetchReturnCounts,
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
  AlertBanner,
  PipelineBar,
  type PipelineRow,
  type KpiItem,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Data hook ────────────────────────────────────────────────────────────────

function useInvoiceTeamData() {
  const [invoices, setInvoices] = useState<InvoiceStatusCounts | null>(null);
  const [returns, setReturns]   = useState<ReturnCounts | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [invRes, retRes] = await Promise.allSettled([
        fetchInvoiceStatusCounts(),
        fetchReturnCounts(),
      ]);
      if (invRes.status === "fulfilled") setInvoices(invRes.value);
      if (retRes.status === "fulfilled") setReturns(retRes.value);
      setLoading(false);
    }
    void load();
  }, []);

  return { invoices, returns, loading };
}

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  invoice_team: "Invoice Team",
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
    description: "Create new invoice",
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
    label: "Returns Queue",
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
    icon: ListChecks,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Customer list",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoiceTeamDashboard() {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const { invoices, returns, loading } = useInvoiceTeamData();

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const kpis: KpiItem[] = [
    {
      label: "Ready Invoices",
      value: invoices?.ready ?? "—",
      sub: "Awaiting warehouse",
      icon: ScanLine,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: "Done Today",
      value: invoices?.doneToday ?? "—",
      sub: "Executed today",
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
      trend: invoices?.doneToday ? "up" : "neutral",
    },
    {
      label: "Received Today",
      value: invoices?.receivedToday ?? "—",
      sub: "Customer confirmed",
      icon: CheckCircle2,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      loading,
    },
    {
      label: "Pending Returns",
      value: returns?.draft ?? "—",
      sub: "Awaiting processing",
      icon: RotateCcw,
      color: returns?.draft ? "text-violet-500" : "text-muted-foreground",
      bg: returns?.draft ? "bg-violet-500/10" : "bg-muted/20",
      border: returns?.draft ? "border-violet-500/20" : "border-border",
      loading,
    },
  ];

  return (
    <DashboardShell
      icon={Receipt}
      title="Invoice Dashboard"
      subtitle={`${roleLabel} · Invoice Workflow & Processing`}
      accent="blue"
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

      {/* Operational alerts */}
      {!loading && (
        <div className="space-y-2">
          {(invoices?.ready ?? 0) > 0 && (
            <AlertBanner
              severity="warning"
              icon={Clock}
              message={`${invoices!.ready} invoice${invoices!.ready !== 1 ? "s" : ""} ready — waiting for warehouse execution`}
              onClick={() => navigate("/invoices")}
            />
          )}
          {(returns?.draft ?? 0) > 0 && (
            <AlertBanner
              severity="info"
              icon={RotateCcw}
              message={`${returns!.draft} return${returns!.draft !== 1 ? "s" : ""} pending processing`}
              onClick={() => navigate("/returns")}
            />
          )}
          {(invoices?.cancelled ?? 0) > 0 && (
            <AlertBanner
              severity="danger"
              icon={XCircle}
              message={`${invoices!.cancelled} cancelled invoice${invoices!.cancelled !== 1 ? "s" : ""} — review required`}
              onClick={() => navigate("/invoices")}
            />
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Invoice lifecycle pipeline */}
        <SectionCard
          title="Invoice Pipeline"
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
              { label: "Draft",     count: invoices?.draft    ?? 0, bar: "bg-muted-foreground/30", text: "text-muted-foreground" },
              { label: "Ready",     count: invoices?.ready    ?? 0, bar: "bg-amber-500",           text: "text-amber-400" },
              { label: "Done",      count: invoices?.done     ?? 0, bar: "bg-emerald-500",         text: "text-emerald-400" },
              { label: "Received",  count: invoices?.received ?? 0, bar: "bg-blue-500",            text: "text-blue-400" },
              { label: "Cancelled", count: invoices?.cancelled ?? 0, bar: "bg-red-500",            text: "text-red-400" },
              { label: "Returns",   count: invoices?.returns  ?? 0, bar: "bg-violet-500",          text: "text-violet-400" },
            ] satisfies PipelineRow[]}
            total={invoices?.total ?? 0}
            loading={loading}
          />
          <div className="pt-3 mt-2 border-t border-border text-center">
            <p className="text-2xl font-bold text-foreground">{loading ? "…" : invoices?.total ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Total invoices</p>
          </div>
        </SectionCard>

        {/* Recent invoices */}
        <SectionCard
          title="Recent Invoices"
          icon={FileText}
          iconClass="text-blue-400"
        >
          {loading ? (
            <LoadingRows count={5} />
          ) : !invoices || invoices.recent.length === 0 ? (
            <EmptyState icon={FileText} message="No invoices yet" sub="Create the first invoice to get started" />
          ) : (
            <div className="space-y-1.5">
              {invoices.recent.map((inv) => (
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
      </div>

      <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
