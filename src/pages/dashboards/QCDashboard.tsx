import { useEffect, useState } from "react";
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  ClipboardList,
  Package,
  ShieldCheck,
  UploadCloud,
  ThermometerSnowflake,
  Activity,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  fetchQcLineCounts,
  fetchGrnStatusCounts,
  type QcLineCounts,
  type GrnStatusCounts,
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

interface QCData {
  qc: QcLineCounts;
  grns: GrnStatusCounts;
}

function useQCData() {
  const [data, setData]     = useState<QCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [qcRes, grnRes] = await Promise.allSettled([
        fetchQcLineCounts(),
        fetchGrnStatusCounts(),
      ]);
      setData({
        qc:   qcRes.status  === "fulfilled" ? qcRes.value  : { holdLines: 0, rejectLines: 0, awaitingPosting: 0 },
        grns: grnRes.status === "fulfilled" ? grnRes.value : { draft: 0, received: 0, inspected: 0, municipality_pending: 0, approved: 0, partial_hold: 0, completed: 0, rejected: 0, total: 0, todayCount: 0, recent: [] },
      });
      setLoading(false);
    }
    void load();
  }, []);

  return { data, loading };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

const ACTIONS: ActionItem[] = [
  {
    label: "GRN List",
    path: "/grn",
    icon: ClipboardList,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "All receiving notes",
  },
  {
    label: "Stock View",
    path: "/stock",
    icon: Package,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "Current inventory",
  },
  {
    label: "Cold Storage",
    path: "/warehouse/fridge",
    icon: ThermometerSnowflake,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Expiry-critical batches",
  },
  {
    label: "Movements",
    path: "/warehouse/movements",
    icon: Activity,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    description: "Stock ledger",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function QCDashboard() {
  const navigate = useNavigate();
  const { data, loading } = useQCData();

  const kpis: KpiItem[] = [
    {
      label: "Pending Inspection",
      value: data?.grns.received ?? "—",
      sub: "GRNs awaiting QC",
      icon: Eye,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: "Lines on Hold",
      value: data?.qc.holdLines ?? "—",
      sub: "Held across all GRNs",
      icon: Clock,
      color: data?.qc.holdLines ? "text-orange-500" : "text-muted-foreground",
      bg: data?.qc.holdLines ? "bg-orange-500/10" : "bg-muted/20",
      border: data?.qc.holdLines ? "border-orange-500/20" : "border-border",
      loading,
    },
    {
      label: "Rejected Lines",
      value: data?.qc.rejectLines ?? "—",
      sub: "QC failures",
      icon: XCircle,
      color: data?.qc.rejectLines ? "text-red-500" : "text-muted-foreground",
      bg: data?.qc.rejectLines ? "bg-red-500/10" : "bg-muted/20",
      border: data?.qc.rejectLines ? "border-red-500/20" : "border-border",
      loading,
    },
    {
      label: "Awaiting Posting",
      value: data?.qc.awaitingPosting ?? "—",
      sub: "Approved, ready for stock",
      icon: UploadCloud,
      color: data?.qc.awaitingPosting ? "text-violet-500" : "text-muted-foreground",
      bg: data?.qc.awaitingPosting ? "bg-violet-500/10" : "bg-muted/20",
      border: data?.qc.awaitingPosting ? "border-violet-500/20" : "border-border",
      loading,
      trend: data?.qc.awaitingPosting ? "up" : "neutral",
    },
  ];

  return (
    <DashboardShell
      icon={ScanLine}
      title="Quality Control"
      subtitle="QC Inspector · Inspection & Approval Workflow"
      accent="emerald"
      headerAction={
        <button
          onClick={() => navigate("/grn")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          View GRNs
        </button>
      }
    >
      <KpiGrid items={kpis} />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Pending inspection list */}
        <SectionCard
          title="GRN Pipeline"
          icon={Clock}
          iconClass="text-amber-400"
        >
          {loading ? (
            <LoadingRows count={5} />
          ) : !data ? (
            <EmptyState icon={CheckCircle2} message="No data" sub="Could not load GRN status" />
          ) : (
            <>
              <PipelineBar
                rows={[
                  { label: "Draft",     count: data.grns.draft,     bar: "bg-muted-foreground/30", text: "text-muted-foreground" },
                  { label: "Received",  count: data.grns.received,  bar: "bg-amber-500",           text: "text-amber-400" },
                  { label: "Inspected", count: data.grns.inspected, bar: "bg-violet-500",           text: "text-violet-400" },
                  { label: "Approved",  count: data.grns.approved,  bar: "bg-blue-500",            text: "text-blue-400" },
                  { label: "Completed", count: data.grns.completed, bar: "bg-emerald-500",         text: "text-emerald-400" },
                  { label: "Rejected",  count: data.grns.rejected,  bar: "bg-red-500",             text: "text-red-400" },
                ] satisfies PipelineRow[]}
                total={data.grns.total}
                loading={loading}
              />
              <div className="pt-3 mt-2 border-t border-border text-center">
                <p className="text-2xl font-bold text-foreground">{data.grns.total}</p>
                <p className="text-[10px] text-muted-foreground">Total GRNs</p>
              </div>
            </>
          )}
        </SectionCard>

        {/* QC workflow guide */}
        <SectionCard title="Inspection Workflow" icon={ShieldCheck} iconClass="text-violet-400">
          <div className="space-y-3">
            {[
              { step: "1", label: "Received",  desc: "GRN has been physically received by warehouse",       color: "text-amber-400",  bg: "bg-amber-500/10"  },
              { step: "2", label: "Inspect",   desc: "Open GRN → QC page to log inspection result",         color: "text-orange-400", bg: "bg-orange-500/10" },
              { step: "3", label: "Inspected", desc: "QC complete — ready for management approval",          color: "text-violet-400", bg: "bg-violet-500/10" },
              { step: "4", label: "Approved",  desc: "Ready to post — items will enter inventory",           color: "text-blue-400",   bg: "bg-blue-500/10"   },
              { step: "5", label: "Completed", desc: "Posted to inventory — stock balances updated",         color: "text-emerald-400",bg: "bg-emerald-500/10"},
            ].map(({ step, label, desc, color, bg }) => (
              <div key={step} className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`text-[10px] font-bold ${color}`}>{step}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${color}`}>{label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {data && data.grns.received > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <AlertBanner
                severity="warning"
                message={`${data.grns.received} GRN${data.grns.received !== 1 ? "s" : ""} waiting for inspection`}
                onClick={() => {/* navigate handled by action grid */}}
              />
            </div>
          )}

          {data && data.qc.awaitingPosting > 0 && (
            <div className="mt-2">
              <AlertBanner
                severity="info"
                icon={UploadCloud}
                message={`${data.qc.awaitingPosting} approved GRN${data.qc.awaitingPosting !== 1 ? "s" : ""} awaiting posting`}
              />
            </div>
          )}
        </SectionCard>
      </div>

      <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={2} />
    </DashboardShell>
  );
}
