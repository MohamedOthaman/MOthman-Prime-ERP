import { useEffect, useState } from "react";
import {
  ShoppingBag,
  ClipboardList,
  Package,
  FileSpreadsheet,
  TrendingDown,
  Truck,
  CheckCircle2,
  UploadCloud,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";
import {
  fetchGrnStatusCounts,
  fetchQcLineCounts,
  type GrnStatusCounts,
  type QcLineCounts,
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

interface PurchasingData {
  grns: GrnStatusCounts;
  qc: QcLineCounts;
}

function usePurchasingData() {
  const [data, setData]     = useState<PurchasingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [grnRes, qcRes] = await Promise.allSettled([
        fetchGrnStatusCounts(),
        fetchQcLineCounts(),
      ]);
      setData({
        grns: grnRes.status === "fulfilled" ? grnRes.value : { draft: 0, received: 0, inspected: 0, municipality_pending: 0, approved: 0, partial_hold: 0, completed: 0, rejected: 0, total: 0, todayCount: 0, recent: [] },
        qc:   qcRes.status  === "fulfilled" ? qcRes.value  : { holdLines: 0, rejectLines: 0, awaitingPosting: 0 },
      });
      setLoading(false);
    }
    void load();
  }, []);

  return { data, loading };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PurchasingDashboard() {
  const navigate = useNavigate();
  const { t }    = useLang();
  const { role } = usePermissions();
  const { data, loading } = usePurchasingData();

  const ROLE_LABELS: Record<string, string> = {
    purchase_manager: t("rolePurchaseManager", "Purchase Manager"),
    purchase:         t("rolePurchaseStaff", "Purchase Staff"),
  };

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const actions: ActionItem[] = [
    { label: t("newGRN", "New GRN"),         path: "/grn/new",        icon: ClipboardList, color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/20",  description: t("recordNewDelivery", "Record new delivery") },
    { label: t("grnList", "GRN List"),       path: "/grn",            icon: Truck,         color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20",   description: t("allReceivingNotes", "All receiving notes") },
    { label: t("manageProducts", "Products"),path: "/products",       icon: Package,       color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/20",description: t("productCatalogue", "Product catalogue") },
    { label: t("importExportTitle", "Import / Export"), path: "/import-export", icon: FileSpreadsheet, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", description: t("bulkDataTools", "Bulk data tools") },
  ];

  const kpis: KpiItem[] = [
    {
      label: t("todaysDeliveries", "Today's Deliveries"),
      value: data?.grns.todayCount ?? "—",
      sub: t("grnsReceivedToday", "GRNs received today"),
      icon: Truck,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      loading,
      trend: data?.grns.todayCount ? "up" : "neutral",
    },
    {
      label: t("pendingInspection", "Pending Inspection"),
      value: data?.grns.received ?? "—",
      sub: t("awaitingQc", "Awaiting QC"),
      icon: ClipboardList,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: t("awaitingPosting", "Awaiting Posting"),
      value: data?.qc.awaitingPosting ?? "—",
      sub: t("approvedPostToStock", "Approved, post to stock"),
      icon: UploadCloud,
      color: data?.qc.awaitingPosting ? "text-violet-500" : "text-muted-foreground",
      bg: data?.qc.awaitingPosting ? "bg-violet-500/10" : "bg-muted/20",
      border: data?.qc.awaitingPosting ? "border-violet-500/20" : "border-border",
      loading,
    },
    {
      label: t("completedGrns", "Completed GRNs"),
      value: data?.grns.completed ?? "—",
      sub: t("postedToInventory", "Posted to inventory"),
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
    },
  ];

  return (
    <DashboardShell
      icon={ShoppingBag}
      title={t("purchasingDashboardTitle", "Purchasing Dashboard")}
      subtitle={`${roleLabel} · ${t("procurementReceivingSubtitle", "Procurement & Receiving")}`}
      accent="orange"
      headerAction={
        <button
          onClick={() => navigate("/grn/new")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          {t("newGRN", "New GRN")}
        </button>
      }
    >
      <KpiGrid items={kpis} />

      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard
          title={t("recentDeliveries", "Recent Deliveries")}
          icon={Truck}
          iconClass="text-blue-400"
          action={
            <button
              onClick={() => navigate("/grn")}
              className="text-[10px] text-primary font-medium hover:underline"
            >
              {t("viewAll", "View all →")}
            </button>
          }
        >
          {loading ? (
            <LoadingRows count={5} />
          ) : !data || data.grns.recent.length === 0 ? (
            <EmptyState icon={Truck} message={t("noGrnsYet", "No GRNs recorded yet")} sub={t("createFirstGrn", "Create your first GRN to get started")} />
          ) : (
            <div className="space-y-1.5">
              {data.grns.recent.map((grn) => (
                <button
                  key={grn.id}
                  onClick={() => navigate(`/grn/${grn.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg bg-muted/30 hover:bg-muted/50 px-3 py-2.5 transition text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {grn.grn_no ?? `GRN #${grn.id?.slice(0, 8)}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {grn.supplier_name ?? t("unknownSupplier", "Unknown supplier")} · {new Date(grn.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusPill status={grn.status ?? "draft"} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("receivingPipeline", "Receiving Pipeline")} icon={TrendingDown} iconClass="text-orange-400">
          {loading ? (
            <LoadingRows count={6} />
          ) : !data ? null : (
            <>
              <PipelineBar
                rows={[
                  { label: t("draft", "Draft"),         count: data.grns.draft,     bar: "bg-muted-foreground/30", text: "text-muted-foreground" },
                  { label: t("received", "Received"),   count: data.grns.received,  bar: "bg-amber-500",           text: "text-amber-400" },
                  { label: t("inspected", "Inspected"), count: data.grns.inspected, bar: "bg-violet-500",          text: "text-violet-400" },
                  { label: t("approved", "Approved"),   count: data.grns.approved,  bar: "bg-blue-500",            text: "text-blue-400" },
                  { label: t("completed", "Completed"), count: data.grns.completed, bar: "bg-emerald-500",         text: "text-emerald-400" },
                  { label: t("rejected", "Rejected"),   count: data.grns.rejected,  bar: "bg-red-500",             text: "text-red-400" },
                ] satisfies PipelineRow[]}
                total={data.grns.total}
                loading={loading}
              />

              <div className="pt-3 mt-2 border-t border-border grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-foreground">{data.grns.total}</p>
                  <p className="text-[10px] text-muted-foreground">{t("totalGrns", "Total GRNs")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400">{data.grns.completed}</p>
                  <p className="text-[10px] text-muted-foreground">{t("inStock", "In Stock")}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-violet-400">{data.qc.awaitingPosting}</p>
                  <p className="text-[10px] text-muted-foreground">{t("postReady", "Post Ready")}</p>
                </div>
              </div>

              {data.qc.awaitingPosting > 0 && (
                <div className="mt-3">
                  <AlertBanner
                    severity="info"
                    icon={UploadCloud}
                    message={`${data.qc.awaitingPosting} ${t("approvedGrn", "approved GRN")}${data.qc.awaitingPosting !== 1 ? t("pluralSuffix", "s") : ""} ${t("readyToPostInventory", "ready to post to inventory")}`}
                    onClick={() => {/* navigates via GRN list */}}
                  />
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <ActionGrid actions={actions} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
