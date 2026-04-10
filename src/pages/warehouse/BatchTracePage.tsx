/**
 * BatchTracePage — batch traceability detail.
 * Route: /stock/batch/:batchId
 *
 * Shows:
 *   - Batch header (product, GRN, dates, qty, storage)
 *   - Current available qty
 *   - Full movement history for this batch from inventory_movements
 *   - Quick links back to GRN and related invoice if available
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Package,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Settings2,
  RefreshCw,
  CalendarDays,
  Warehouse,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingRows, EmptyState, StatusPill } from "@/components/dashboard/DashboardShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatchInfo {
  id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  batch_number: string | null;
  grn_id: string | null;
  grn_no: string | null;
  received_date: string | null;
  expiry_date: string | null;
  qty_received: number;
  qty_available: number;
  storage_type: string | null;
  putaway_location: string | null;
  status: string;
}

interface MovementRow {
  id: string;
  movement_type: string;
  qty_change: number;
  performed_at: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  performed_by: string | null;
}

// ─── Movement type config ─────────────────────────────────────────────────────

const MOVEMENT_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  sign: "+" | "-";
}> = {
  INBOUND:    { label: "Inbound",    icon: ArrowUpRight,   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", sign: "+" },
  OUTBOUND:   { label: "Outbound",   icon: ArrowDownLeft,  color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    sign: "-" },
  RETURN:     { label: "Return",     icon: RotateCcw,      color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  sign: "+" },
  ADJUSTMENT: { label: "Adjustment", icon: Settings2,      color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   sign: "±" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function isExpired(expiry: string | null | undefined): boolean {
  if (!expiry) return false;
  return new Date(expiry) < new Date();
}

function daysUntilExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const diff = new Date(expiry).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BatchTracePage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const [batch, setBatch]         = useState<BatchInfo | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  async function load() {
    if (!batchId) return;
    setLoading(true);
    setError(null);

    const [batchRes, movRes] = await Promise.allSettled([
      supabase
        .from("inventory_batches" as any)
        .select(`
          id, product_id, batch_number, grn_id,
          received_date, expiry_date, qty_received, qty_available,
          storage_type, putaway_location_ref, status,
          products_overview:product_id ( name, code )
        `)
        .eq("id", batchId)
        .single(),

      supabase
        .from("inventory_movements" as any)
        .select("id, movement_type, qty_change, performed_at, reference_type, reference_id, notes, performed_by")
        .eq("batch_id", batchId)
        .order("performed_at", { ascending: false })
        .limit(200),
    ]);

    if (batchRes.status === "fulfilled" && (batchRes.value as any).data) {
      const raw = (batchRes.value as any).data;
      const product = raw.products_overview as any;
      setBatch({
        id:               raw.id,
        product_id:       raw.product_id,
        product_name:     product?.name ?? null,
        product_code:     product?.code ?? null,
        batch_number:     raw.batch_number ?? null,
        grn_id:           raw.grn_id ?? null,
        grn_no:           null, // resolved separately if needed
        received_date:    raw.received_date ?? null,
        expiry_date:      raw.expiry_date ?? null,
        qty_received:     Number(raw.qty_received ?? 0),
        qty_available:    Number(raw.qty_available ?? 0),
        storage_type:     raw.storage_type ?? null,
        putaway_location: raw.putaway_location_ref ?? null,
        status:           raw.status ?? "active",
      });
    } else if (batchRes.status === "rejected") {
      setError("Batch not found or access denied");
    }

    if (movRes.status === "fulfilled") {
      setMovements(((movRes.value as any).data ?? []) as MovementRow[]);
    }

    // Resolve GRN number if grn_id exists
    if (batchRes.status === "fulfilled" && (batchRes.value as any).data?.grn_id) {
      const grnId = (batchRes.value as any).data.grn_id;
      const { data: grn } = await supabase
        .from("grn_headers" as any)
        .select("grn_no")
        .eq("id", grnId)
        .single();
      if (grn) {
        setBatch((prev) => prev ? { ...prev, grn_no: (grn as any).grn_no ?? null } : prev);
      }
    }

    setLoading(false);
  }

  useEffect(() => { void load(); }, [batchId]);

  const days = daysUntilExpiry(batch?.expiry_date);
  const expired = isExpired(batch?.expiry_date);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl border shrink-0
            ${expired ? "bg-red-500/10 border-red-500/20" : "bg-cyan-500/10 border-cyan-500/20"}`}>
            <Package className={`w-4 h-4 ${expired ? "text-red-400" : "text-cyan-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">
              {loading ? "Loading…" : (batch?.product_name ?? "Batch Trace")}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {batch?.batch_number ? `Batch ${batch.batch_number}` : "Batch Traceability"}
              {batch?.product_code ? ` · ${batch.product_code}` : ""}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-5">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400/40" />
            <p className="text-sm font-medium text-muted-foreground">{error}</p>
            <button onClick={() => navigate(-1)} className="text-xs text-primary hover:underline">
              ← Go back
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
            <LoadingRows count={5} />
          </div>
        ) : !batch ? null : (
          <>
            {/* Batch summary card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              {/* Expiry alert */}
              {expired && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400 font-medium">
                    Expired {Math.abs(days!)} day{Math.abs(days!) !== 1 ? "s" : ""} ago
                  </p>
                </div>
              )}
              {!expired && days !== null && days <= 30 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-400 font-medium">
                    Expires in {days} day{days !== 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {/* Qty strip */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/30 px-3 py-2.5">
                  <p className="text-xl font-bold text-foreground">{batch.qty_received}</p>
                  <p className="text-[10px] text-muted-foreground">Received</p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
                  <p className="text-xl font-bold text-emerald-400">{batch.qty_available}</p>
                  <p className="text-[10px] text-muted-foreground">Available</p>
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2.5">
                  <p className="text-xl font-bold text-foreground">{batch.qty_received - batch.qty_available}</p>
                  <p className="text-[10px] text-muted-foreground">Consumed</p>
                </div>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                {[
                  { label: "Product",   value: batch.product_name ?? "—" },
                  { label: "Code",      value: batch.product_code ?? "—" },
                  { label: "Batch No.", value: batch.batch_number ?? "—" },
                  { label: "Storage",   value: batch.storage_type ?? "—" },
                  { label: "Location",  value: batch.putaway_location ?? "—" },
                  { label: "Status",    value: <StatusPill status={batch.status} /> },
                  { label: "Received",  value: fmtDate(batch.received_date) },
                  { label: "Expiry",    value: (
                    <span className={expired ? "text-red-400 font-medium" : days !== null && days <= 30 ? "text-amber-400 font-medium" : ""}>
                      {fmtDate(batch.expiry_date)}
                    </span>
                  )},
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground shrink-0 w-20">{label}</span>
                    <span className="font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>

              {/* GRN / receiving link */}
              {batch.grn_id && (
                <button
                  onClick={() => navigate(`/grn/${batch.grn_id}`)}
                  className="flex items-center gap-2 w-full rounded-lg bg-muted/30 hover:bg-muted/50 px-3 py-2.5 transition text-left"
                >
                  <ClipboardList className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-xs font-medium text-foreground flex-1">
                    GRN: {batch.grn_no ?? batch.grn_id.slice(0, 8)}
                  </span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Movement history */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-foreground">Movement History</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {movements.length} event{movements.length !== 1 ? "s" : ""}
                </span>
              </div>

              {movements.length === 0 ? (
                <EmptyState icon={Warehouse} message="No movements recorded" sub="Movement events will appear here as stock is received, picked, or returned" />
              ) : (
                <div className="space-y-1.5">
                  {movements.map((mov) => {
                    const cfg = MOVEMENT_CONFIG[mov.movement_type] ?? {
                      label: mov.movement_type,
                      icon: Settings2,
                      color: "text-muted-foreground",
                      bg: "bg-muted/20",
                      border: "border-border",
                      sign: "±" as const,
                    };
                    const Icon = cfg.icon;
                    const absQty = Math.abs(mov.qty_change);
                    return (
                      <div
                        key={mov.id}
                        className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5"
                      >
                        <div className={`flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${cfg.bg} ${cfg.border}`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">{cfg.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtDateTime(mov.performed_at)}
                            {mov.reference_type && ` · ${mov.reference_type}`}
                          </p>
                          {mov.notes && (
                            <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{mov.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold tabular-nums ${cfg.color}`}>
                            {cfg.sign === "±" ? "±" : mov.qty_change > 0 ? "+" : "−"}{absQty}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
