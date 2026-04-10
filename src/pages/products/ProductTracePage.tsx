/**
 * ProductTracePage — product-level traceability view.
 * Route: /products/:productId/trace
 *
 * Shows:
 *   - Product header (name, code, category)
 *   - All inventory_batches for this product (FEFO order)
 *   - Per-batch: qty_received, qty_available, expiry, location, batch number
 *   - Aggregate stock summary (total available, total received, batches count)
 *   - Click any batch row → BatchTracePage (/stock/batch/:batchId)
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Package,
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  RefreshCw,
  Layers,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingRows, EmptyState, StatusPill } from "@/components/dashboard/DashboardShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductInfo {
  id: string;
  name: string | null;
  code: string | null;
  category: string | null;
}

interface BatchRow {
  id: string;
  batch_number: string | null;
  grn_id: string | null;
  received_date: string | null;
  expiry_date: string | null;
  qty_received: number;
  qty_available: number;
  storage_type: string | null;
  putaway_location: string | null;
  status: string;
  days_to_expiry: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-red-400 font-semibold";
  if (days <= 30) return "text-amber-400 font-semibold";
  return "text-foreground";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductTracePage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!productId) return;
    setLoading(true);
    setError(null);

    const [prodRes, batchRes] = await Promise.allSettled([
      supabase
        .from("products_overview" as any)
        .select("id, name, code, category")
        .eq("id", productId)
        .single(),

      supabase
        .from("inventory_batches" as any)
        .select(`
          id, batch_number, grn_id,
          received_date, expiry_date,
          qty_received, qty_available,
          storage_type, putaway_location_ref, status
        `)
        .eq("product_id", productId)
        .order("expiry_date", { ascending: true, nullsFirst: false }),
    ]);

    if (prodRes.status === "fulfilled" && (prodRes.value as any).data) {
      const raw = (prodRes.value as any).data;
      setProduct({
        id:       raw.id,
        name:     raw.name ?? null,
        code:     raw.code ?? null,
        category: raw.category ?? null,
      });
    } else {
      setError("Product not found");
    }

    if (batchRes.status === "fulfilled") {
      const rows: BatchRow[] = ((batchRes.value as any).data ?? []).map((r: any) => ({
        id:               r.id,
        batch_number:     r.batch_number ?? null,
        grn_id:           r.grn_id ?? null,
        received_date:    r.received_date ?? null,
        expiry_date:      r.expiry_date ?? null,
        qty_received:     Number(r.qty_received ?? 0),
        qty_available:    Number(r.qty_available ?? 0),
        storage_type:     r.storage_type ?? null,
        putaway_location: r.putaway_location_ref ?? null,
        status:           r.status ?? "active",
        days_to_expiry:   daysBetween(r.expiry_date),
      }));
      setBatches(rows);
    }

    setLoading(false);
  }

  useEffect(() => { void load(); }, [productId]);

  const summary = useMemo(() => ({
    totalAvailable: batches.reduce((sum, b) => sum + b.qty_available, 0),
    totalReceived:  batches.reduce((sum, b) => sum + b.qty_received, 0),
    activeBatches:  batches.filter((b) => b.qty_available > 0).length,
    expiredBatches: batches.filter((b) => (b.days_to_expiry ?? 1) < 0).length,
    nearBatches:    batches.filter((b) => b.days_to_expiry !== null && b.days_to_expiry >= 0 && b.days_to_expiry <= 30).length,
  }), [batches]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 shrink-0">
            <Layers className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">
              {loading ? "Loading…" : (product?.name ?? "Product Trace")}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {product?.code ? `${product.code} · ` : ""}
              {loading ? "Loading…" : `${batches.length} batch${batches.length !== 1 ? "es" : ""} · FEFO order`}
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

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400/40" />
            <p className="text-sm font-medium text-muted-foreground">{error}</p>
            <button onClick={() => navigate(-1)} className="text-xs text-primary hover:underline">← Go back</button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-24 rounded-xl bg-muted/40 animate-pulse" />
            <LoadingRows count={6} />
          </div>
        ) : !product ? null : (
          <>
            {/* Expiry alerts */}
            {summary.expiredBatches > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <p className="text-xs text-red-400 font-medium">
                  {summary.expiredBatches} expired batch{summary.expiredBatches !== 1 ? "es" : ""} — review immediately
                </p>
              </div>
            )}
            {summary.nearBatches > 0 && summary.expiredBatches === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-400 font-medium">
                  {summary.nearBatches} batch{summary.nearBatches !== 1 ? "es" : ""} expiring within 30 days
                </p>
              </div>
            )}

            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Available",       value: summary.totalAvailable.toLocaleString(), color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
                { label: "Total Received",  value: summary.totalReceived.toLocaleString(),  color: "text-foreground",  bg: "bg-muted/30 border-border" },
                { label: "Active Batches",  value: summary.activeBatches,                   color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
                { label: "Total Batches",   value: batches.length,                          color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`rounded-xl border px-3 py-3 text-center ${bg}`}>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Product info card */}
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/40 shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{product.name ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {product.code && <span className="font-mono">{product.code}</span>}
                    {product.code && product.category && " · "}
                    {product.category}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/products`)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
                >
                  Products
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Batch table */}
            {batches.length === 0 ? (
              <EmptyState icon={BarChart3} message="No batches found" sub="Batches will appear here once stock is received via GRN" />
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  <h2 className="text-sm font-semibold text-foreground">Batch Inventory</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">FEFO order</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Batch</th>
                        <th className="px-3 py-2 text-left font-medium">Storage / Location</th>
                        <th className="px-3 py-2 text-right font-medium">Received</th>
                        <th className="px-3 py-2 text-right font-medium">Available</th>
                        <th className="px-3 py-2 text-center font-medium">Expiry</th>
                        <th className="px-3 py-2 text-center font-medium">Status</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((b) => {
                        const expired = (b.days_to_expiry ?? 1) < 0;
                        const near    = !expired && b.days_to_expiry !== null && b.days_to_expiry <= 30;
                        return (
                          <tr
                            key={b.id}
                            onClick={() => navigate(`/stock/batch/${b.id}`)}
                            className={`border-t border-border/40 hover:bg-muted/20 cursor-pointer transition-colors ${expired ? "bg-red-500/3" : ""}`}
                          >
                            <td className="px-4 py-2.5">
                              <p className="font-mono font-medium text-foreground">{b.batch_number ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground">{fmtDate(b.received_date)}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-foreground">{b.storage_type ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground">{b.putaway_location ?? "—"}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                              {b.qty_received.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className={`font-bold tabular-nums ${b.qty_available > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {b.qty_available.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={expiryClass(b.days_to_expiry)}>
                                {fmtDate(b.expiry_date)}
                              </span>
                              {(expired || near) && (
                                <p className={`text-[9px] font-bold mt-0.5 ${expired ? "text-red-400" : "text-amber-400"}`}>
                                  {expired ? `${Math.abs(b.days_to_expiry!)}d ago` : `${b.days_to_expiry}d left`}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <StatusPill status={b.status} />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 inline" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/60 bg-muted/20">
                        <td colSpan={2} className="px-4 py-2 text-xs font-medium text-muted-foreground">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-foreground tabular-nums">
                          {summary.totalReceived.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-emerald-400 tabular-nums">
                          {summary.totalAvailable.toLocaleString()}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
