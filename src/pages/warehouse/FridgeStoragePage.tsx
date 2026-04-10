/**
 * FridgeStoragePage — cold-room / temperature-controlled stock view.
 * Route: /warehouse/fridge
 *
 * Groups inventory_batches by storage_type (Frozen / Chilled / Dry) and
 * surfaces expiry-critical items first (FEFO order).
 *
 * Data source: inventory_batches joined to products_overview via Supabase.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ThermometerSnowflake,
  Wind,
  Flame,
  Package,
  AlertTriangle,
  CalendarX2,
  Search,
  RefreshCw,
  ArrowLeft,
  ArrowUpRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingRows } from "@/components/dashboard/DashboardShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  qty_available: number;
  storage_type: string;
  putaway_location: string | null;
  grn_id: string | null;
  days_to_expiry: number | null;
}

// ─── Storage config ───────────────────────────────────────────────────────────

const STORAGE_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  headerBg: string;
}> = {
  Frozen:  { label: "Frozen",  icon: ThermometerSnowflake, color: "text-cyan-400",   bg: "bg-cyan-500/8",    border: "border-cyan-500/20",   headerBg: "bg-cyan-500/10"   },
  Chilled: { label: "Chilled", icon: Wind,                 color: "text-blue-400",   bg: "bg-blue-500/8",    border: "border-blue-500/20",   headerBg: "bg-blue-500/10"   },
  Dry:     { label: "Dry",     icon: Flame,                color: "text-amber-400",  bg: "bg-amber-500/8",   border: "border-amber-500/20",  headerBg: "bg-amber-500/10"  },
};

const STORAGE_ORDER = ["Frozen", "Chilled", "Dry"];

function daysBetween(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-red-400 font-semibold";
  if (days <= 30) return "text-amber-400 font-semibold";
  return "text-foreground";
}

function expiryBadge(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return "EXPIRED";
  if (days <= 7)  return `${days}d`;
  if (days <= 30) return `${days}d`;
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FridgeStoragePage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [activeType, setActiveType] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("inventory_batches" as any)
      .select(`
        id, product_id, batch_number, grn_id,
        expiry_date, qty_available, storage_type, putaway_location_ref,
        products_overview:product_id ( name, code )
      `)
      .gt("qty_available", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows: BatchRow[] = ((data ?? []) as any[]).map((r) => {
      const prod = r.products_overview as any;
      const days = daysBetween(r.expiry_date);
      return {
        id:               r.id,
        product_id:       r.product_id,
        product_name:     prod?.name ?? null,
        product_code:     prod?.code ?? null,
        batch_number:     r.batch_number ?? null,
        expiry_date:      r.expiry_date ?? null,
        qty_available:    Number(r.qty_available ?? 0),
        storage_type:     r.storage_type ?? "Dry",
        putaway_location: r.putaway_location_ref ?? null,
        grn_id:           r.grn_id ?? null,
        days_to_expiry:   days,
      };
    });

    setBatches(rows);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return batches.filter((b) => {
      const matchType = activeType === "all" || b.storage_type === activeType;
      if (!matchType) return false;
      if (!q) return true;
      return (
        (b.product_name ?? "").toLowerCase().includes(q) ||
        (b.product_code ?? "").toLowerCase().includes(q) ||
        (b.batch_number ?? "").toLowerCase().includes(q) ||
        (b.putaway_location ?? "").toLowerCase().includes(q)
      );
    });
  }, [batches, search, activeType]);

  // Group filtered by storage type (FEFO order already from server)
  const grouped = useMemo(() => {
    const map = new Map<string, BatchRow[]>();
    for (const t of [...STORAGE_ORDER, "Other"]) map.set(t, []);
    for (const b of filtered) {
      const key = STORAGE_ORDER.includes(b.storage_type) ? b.storage_type : "Other";
      map.get(key)!.push(b);
    }
    return [...map.entries()].filter(([, rows]) => rows.length > 0);
  }, [filtered]);

  // Summary counts per type
  const summary = useMemo(() => {
    const totals: Record<string, { count: number; expired: number; near: number }> = {};
    for (const b of batches) {
      const t = b.storage_type;
      if (!totals[t]) totals[t] = { count: 0, expired: 0, near: 0 };
      totals[t].count++;
      if ((b.days_to_expiry ?? 1) < 0) totals[t].expired++;
      else if ((b.days_to_expiry ?? 999) <= 30) totals[t].near++;
    }
    return totals;
  }, [batches]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 shrink-0">
            <ThermometerSnowflake className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">Cold Storage</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {loading ? "Loading…" : `${filtered.length} batches · FEFO order`}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Type + search bar */}
        <div className="max-w-5xl mx-auto px-4 pb-3 flex gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {[{ key: "all", label: "All" }, ...STORAGE_ORDER.map((t) => ({ key: t, label: t }))].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveType(key)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition
                  ${activeType === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
              >
                {label}
                {key !== "all" && summary[key] && (
                  <span className="ml-1 opacity-60">{summary[key].count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, batch, location…"
              className="w-full text-xs bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-5">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="rounded-xl border border-border bg-card p-4"><LoadingRows count={4} /></div>)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400/40" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button onClick={load} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState icon={Package} message="No stock found" sub="Stock will appear here once received and posted to inventory" />
        ) : (
          grouped.map(([storageType, rows]) => {
            const cfg = STORAGE_CONFIG[storageType] ?? STORAGE_CONFIG.Dry;
            const Icon = cfg.icon;
            const stats = summary[storageType];
            return (
              <div key={storageType} className={`rounded-xl border ${cfg.border} overflow-hidden`}>
                {/* Section header */}
                <div className={`flex items-center gap-3 px-4 py-3 ${cfg.headerBg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
                  <h2 className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</h2>
                  <span className={`text-xs font-mono ${cfg.color} opacity-70`}>{rows.length} batches</span>
                  {stats?.expired > 0 && (
                    <span className="ml-auto text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                      {stats.expired} EXPIRED
                    </span>
                  )}
                  {stats?.near > 0 && stats?.expired === 0 && (
                    <span className="ml-auto text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                      {stats.near} near expiry
                    </span>
                  )}
                </div>

                {/* Table */}
                <div className="bg-card overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Product</th>
                        <th className="px-3 py-2 text-left font-medium">Batch</th>
                        <th className="px-3 py-2 text-left font-medium">Location</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-center font-medium">Expiry</th>
                        <th className="px-3 py-2 text-center font-medium">Days</th>
                        <th className="px-3 py-2 text-right font-medium w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const badge = expiryBadge(row.days_to_expiry);
                        const expired = (row.days_to_expiry ?? 1) < 0;
                        return (
                          <tr
                            key={row.id}
                            className={`border-t border-border/40 hover:bg-muted/20 transition-colors cursor-pointer ${expired ? "bg-red-500/3" : ""}`}
                            onClick={() => navigate(`/stock/batch/${row.id}`)}
                          >
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-foreground truncate max-w-[180px]">
                                {row.product_name ?? "—"}
                              </p>
                              {row.product_code && (
                                <p className="text-[10px] text-muted-foreground font-mono">{row.product_code}</p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-foreground">
                              {row.batch_number ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {row.putaway_location ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-foreground tabular-nums">
                              {row.qty_available.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={expiryClass(row.days_to_expiry)}>
                                {fmtDate(row.expiry_date)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {badge && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  expired
                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                }`}>
                                  {badge}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 inline" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
