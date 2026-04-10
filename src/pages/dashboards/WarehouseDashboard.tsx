import { useEffect, useState } from "react";
import {
  Package,
  ClipboardList,
  FileSpreadsheet,
  Boxes,
  AlertTriangle,
  Eye,
  Truck,
  ThermometerSnowflake,
  Flame,
  Wind,
  CheckCircle2,
  Clock,
  CalendarX2,
  ScanLine,
  RotateCcw,
  Activity,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPickingStats,
  fetchReturnCounts,
  fetchMovementsSummary,
  type PickingStats,
  type ReturnCounts,
  type MovementsSummary,
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
  type KpiItem,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StorageBucket {
  type: string;
  count: number;
  hex: string;
  icon: typeof Package;
}

interface ExpiryBucket {
  expired: number;
  within30: number;
  within180: number;
}

interface GrnRow {
  id: string;
  grn_no: string | null;
  supplier_name: string | null;
  status: string;
  created_at: string;
}

interface BaseWarehouseData {
  todayGrns: number;
  pendingInspection: number;
  recentGrns: GrnRow[];
  storage: StorageBucket[];
  expiry: ExpiryBucket;
}

// ─── Storage type config ──────────────────────────────────────────────────────

const STORAGE_CONFIG: Record<string, { hex: string; icon: typeof Package }> = {
  Frozen:  { hex: "#06b6d4", icon: ThermometerSnowflake },
  Chilled: { hex: "#3b82f6", icon: Wind },
  Dry:     { hex: "#f59e0b", icon: Flame },
};

// ─── Data hook ────────────────────────────────────────────────────────────────

function useWarehouseData() {
  const [base, setBase]             = useState<BaseWarehouseData | null>(null);
  const [picking, setPicking]       = useState<PickingStats | null>(null);
  const [returns, setReturns]       = useState<ReturnCounts | null>(null);
  const [movements, setMovements]   = useState<MovementsSummary | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today  = new Date().toISOString().slice(0, 10);
        const in30   = new Date(Date.now() + 30  * 86400000).toISOString().slice(0, 10);
        const in180  = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

        const [grnRes, stockRes, expiredRes, exp30Res, exp180Res,
               pickRes, retRes, movRes] = await Promise.allSettled([
          supabase
            .from("receiving_headers" as any)
            .select("id, grn_no, supplier_name, status, created_at")
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("inventory_product_stock_summary" as any)
            .select("storage_type")
            .gt("available_quantity", 0),
          supabase
            .from("inventory_product_stock_summary" as any)
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .lt("nearest_expiry", today),
          supabase
            .from("inventory_product_stock_summary" as any)
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .gte("nearest_expiry", today)
            .lte("nearest_expiry", in30),
          supabase
            .from("inventory_product_stock_summary" as any)
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .gte("nearest_expiry", today)
            .lte("nearest_expiry", in180),
          fetchPickingStats(),
          fetchReturnCounts(),
          fetchMovementsSummary(),
        ]);

        // GRN processing
        const grns: GrnRow[] = grnRes.status === "fulfilled" ? ((grnRes.value as any).data ?? []) : [];
        const todayGrns         = grns.filter(g => (g.created_at ?? "").startsWith(today)).length;
        const pendingInspection = grns.filter(g => g.status === "received").length;

        // Storage distribution
        const stockRows: { storage_type: string }[] =
          stockRes.status === "fulfilled" ? ((stockRes.value as any).data ?? []) : [];
        const countsByType: Record<string, number> = {};
        for (const row of stockRows) {
          const t = row.storage_type ?? "Dry";
          countsByType[t] = (countsByType[t] ?? 0) + 1;
        }
        const storage: StorageBucket[] = Object.entries(STORAGE_CONFIG).map(([type, cfg]) => ({
          type, count: countsByType[type] ?? 0, hex: cfg.hex, icon: cfg.icon,
        }));

        const expired   = expiredRes.status  === "fulfilled" ? ((expiredRes.value  as any).count ?? 0) : 0;
        const within30  = exp30Res.status    === "fulfilled" ? ((exp30Res.value    as any).count ?? 0) : 0;
        const within180 = exp180Res.status   === "fulfilled" ? ((exp180Res.value   as any).count ?? 0) : 0;

        setBase({ todayGrns, pendingInspection, recentGrns: grns.slice(0, 6), storage, expiry: { expired, within30, within180 } });
        if (pickRes.status === "fulfilled") setPicking(pickRes.value);
        if (retRes.status  === "fulfilled") setReturns(retRes.value);
        if (movRes.status  === "fulfilled") setMovements(movRes.value);
      } catch {
        // silent fallback — UI shows dashes
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { base, picking, returns, movements, loading };
}

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  warehouse:            "Warehouse",
  warehouse_manager:    "Warehouse Manager",
  inventory_controller: "Inventory Controller",
  inventory:            "Inventory",
  qc:                   "Quality Control",
};

// ─── Actions ─────────────────────────────────────────────────────────────────

const ACTIONS: ActionItem[] = [
  {
    label: "Picking Queue",
    path: "/warehouse/picking",
    icon: ScanLine,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "Start picking",
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
    label: "GRN List",
    path: "/grn",
    icon: Truck,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "Receiving notes",
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
  {
    label: "New GRN",
    path: "/grn/new",
    icon: ClipboardList,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Record delivery",
  },
  {
    label: "Products",
    path: "/products",
    icon: Boxes,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    description: "Product catalogue",
  },
  {
    label: "Cold Storage",
    path: "/warehouse/fridge",
    icon: ThermometerSnowflake,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Frozen / Chilled / Dry",
  },
  {
    label: "Import / Export",
    path: "/import-export",
    icon: FileSpreadsheet,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    description: "Bulk data tools",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarehouseDashboard() {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const { base, picking, returns, movements, loading } = useWarehouseData();

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, " ");

  const kpis: KpiItem[] = [
    {
      label: "Ready to Pick",
      value: picking?.readyInvoices ?? "—",
      sub: "Invoices awaiting picking",
      icon: ScanLine,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      loading,
    },
    {
      label: "Active Picking",
      value: picking?.activeSessions ?? "—",
      sub: "Sessions in progress",
      icon: Eye,
      color: picking?.activeSessions ? "text-amber-500" : "text-muted-foreground",
      bg: picking?.activeSessions ? "bg-amber-500/10" : "bg-muted/20",
      border: picking?.activeSessions ? "border-amber-500/20" : "border-border",
      loading,
    },
    {
      label: "Returns Waiting",
      value: returns?.draft ?? "—",
      sub: "Pending processing",
      icon: RotateCcw,
      color: returns?.draft ? "text-violet-500" : "text-muted-foreground",
      bg: returns?.draft ? "bg-violet-500/10" : "bg-muted/20",
      border: returns?.draft ? "border-violet-500/20" : "border-border",
      loading,
    },
    {
      label: "Movements Today",
      value: movements?.totalToday ?? "—",
      sub: `+${movements?.inboundToday ?? 0} in / -${movements?.outboundToday ?? 0} out`,
      icon: Activity,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      loading,
    },
    {
      label: "Pending Inspection",
      value: base?.pendingInspection ?? "—",
      sub: "GRNs awaiting QC",
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      loading,
    },
    {
      label: "Expiring ≤ 30d",
      value: base?.expiry.within30 ?? "—",
      sub: "SKUs near expiry",
      icon: CalendarX2,
      color: base?.expiry.within30 ? "text-orange-500" : "text-muted-foreground",
      bg: base?.expiry.within30 ? "bg-orange-500/10" : "bg-muted/20",
      border: base?.expiry.within30 ? "border-orange-500/20" : "border-border",
      loading,
    },
    {
      label: "Today's GRNs",
      value: base?.todayGrns ?? "—",
      sub: "Received today",
      icon: Truck,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      loading,
    },
    {
      label: "Expired Stock",
      value: base?.expiry.expired ?? "—",
      sub: "SKUs past expiry",
      icon: AlertTriangle,
      color: base?.expiry.expired ? "text-red-500" : "text-muted-foreground",
      bg: base?.expiry.expired ? "bg-red-500/10" : "bg-muted/20",
      border: base?.expiry.expired ? "border-red-500/20" : "border-border",
      loading,
    },
  ];

  return (
    <DashboardShell
      icon={Package}
      title="Warehouse Dashboard"
      subtitle={`${roleLabel} · Receiving, Picking & Inventory`}
      accent="emerald"
      headerAction={
        <button
          onClick={() => navigate("/warehouse/picking")}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition shrink-0"
        >
          <ScanLine className="w-3.5 h-3.5" />
          Start Picking
        </button>
      }
    >
      {/* 8-KPI grid — 2 rows of 4 on desktop */}
      <KpiGrid items={kpis} />

      {/* Operational alerts */}
      {!loading && (
        <div className="space-y-2">
          {(picking?.readyInvoices ?? 0) > 0 && (
            <AlertBanner
              severity="success"
              icon={ScanLine}
              message={`${picking!.readyInvoices} invoice${picking!.readyInvoices !== 1 ? "s" : ""} ready to pick`}
              onClick={() => navigate("/warehouse/picking")}
            />
          )}
          {(returns?.draft ?? 0) > 0 && (
            <AlertBanner
              severity="info"
              icon={RotateCcw}
              message={`${returns!.draft} return${returns!.draft !== 1 ? "s" : ""} waiting for processing`}
              onClick={() => navigate("/returns")}
            />
          )}
          {(base?.expiry.expired ?? 0) > 0 && (
            <AlertBanner
              severity="danger"
              message={`${base!.expiry.expired} SKU${base!.expiry.expired !== 1 ? "s" : ""} past expiry date — review stock`}
              onClick={() => navigate("/stock")}
            />
          )}
          {(base?.pendingInspection ?? 0) > 0 && (
            <AlertBanner
              severity="warning"
              message={`${base!.pendingInspection} GRN${base!.pendingInspection !== 1 ? "s" : ""} pending QC inspection`}
              onClick={() => navigate("/grn")}
            />
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent GRNs */}
        <SectionCard
          title="Recent Deliveries"
          icon={Truck}
          iconClass="text-blue-400"
          action={
            <button onClick={() => navigate("/grn")} className="text-[10px] text-primary font-medium hover:underline">
              View all →
            </button>
          }
        >
          {loading ? (
            <LoadingRows count={4} />
          ) : !base || base.recentGrns.length === 0 ? (
            <EmptyState icon={Truck} message="No GRNs recorded yet" sub="Start receiving goods to see them here" />
          ) : (
            <div className="space-y-1.5">
              {base.recentGrns.map((grn) => (
                <button
                  key={grn.id}
                  onClick={() => navigate(`/grn/${grn.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg bg-muted/30 hover:bg-muted/50 px-3 py-2.5 transition text-left"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {grn.grn_no ?? `GRN #${grn.id?.slice(0, 8)}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {grn.supplier_name ?? "Unknown supplier"}
                    </p>
                  </div>
                  <StatusPill status={grn.status ?? "draft"} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Storage overview */}
        <SectionCard title="Storage Overview" icon={Boxes} iconClass="text-emerald-400">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(base?.storage ?? Object.entries(STORAGE_CONFIG).map(([type, cfg]) => ({
              type, count: 0, hex: cfg.hex, icon: cfg.icon,
            }))).map(({ type, count, hex, icon: Icon }) => (
              <div key={type} className="text-center rounded-lg border p-2.5" style={{ backgroundColor: `${hex}10`, borderColor: `${hex}25` }}>
                <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: hex }} />
                <p className="text-xs font-semibold text-foreground">{type}</p>
                <p className="text-[11px] font-mono mt-0.5" style={{ color: hex }}>
                  {loading ? "…" : count}
                  <span className="text-muted-foreground font-sans"> SKUs</span>
                </p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-border">
            <h3 className="text-[11px] font-medium text-muted-foreground mb-2.5">Expiry Alerts</h3>
            <div className="space-y-2">
              {[
                { label: "Expired",         count: base?.expiry.expired  ?? 0, color: "text-red-400",    bg: "bg-red-500/8",    border: "border-red-500/20",    icon: AlertTriangle },
                { label: "Within 30 days",  count: base?.expiry.within30 ?? 0, color: "text-orange-400", bg: "bg-orange-500/8", border: "border-orange-500/20", icon: CalendarX2 },
                { label: "Within 6 months", count: base?.expiry.within180 ?? 0, color: "text-yellow-400", bg: "bg-yellow-500/8", border: "border-yellow-500/20", icon: Clock },
              ].map(({ label, count, color, bg, border, icon: Icon }) =>
                count > 0 ? (
                  <div key={label} className={`flex items-center gap-2.5 rounded-lg ${bg} border ${border} px-3 py-2`}>
                    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                    <p className={`text-xs font-medium ${color} flex-1`}>{label}</p>
                    <span className={`text-xs font-bold tabular-nums ${color}`}>{loading ? "…" : count}</span>
                  </div>
                ) : null
              )}
              {!loading && base && base.expiry.expired === 0 && base.expiry.within30 === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/8 border border-emerald-500/15 px-3 py-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-400 font-medium">No critical expiry alerts</p>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={4} />
    </DashboardShell>
  );
}
