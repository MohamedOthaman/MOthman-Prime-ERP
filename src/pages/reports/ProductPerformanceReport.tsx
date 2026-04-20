/**
 * ProductPerformanceReport — /reports/products
 *
 * Product stock levels, batch counts, expiry status, and 30-day outbound velocity.
 * Reuses getProductPerformance() from reportService + inventory_product_stock_summary view.
 */

import { useEffect, useState, useMemo } from "react";
import {
  Package, AlertTriangle, TrendingDown, Search, Download, ThermometerSnowflake, Flame, Wind,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getProductPerformance, type ProductPerformanceRow } from "@/features/services/reportService";
import { exportExcel } from "@/lib/exportUtils";
import {
  DashboardShell,
  KpiGrid,
  SectionCard,
  EmptyState,
  LoadingRows,
  type KpiItem,
} from "@/components/dashboard/DashboardShell";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function expiryClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0)   return "text-red-400 font-semibold";
  if (days <= 30) return "text-amber-400 font-semibold";
  return "text-emerald-400";
}

function expiryLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0)   return `Expired (${Math.abs(days)}d ago)`;
  if (days === 0) return "Expires today";
  return `${days}d`;
}

const STORAGE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Frozen:  ThermometerSnowflake,
  Chilled: Wind,
  Dry:     Flame,
};

const STORAGE_COLOR: Record<string, string> = {
  Frozen:  "text-cyan-400",
  Chilled: "text-blue-400",
  Dry:     "text-amber-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductPerformanceReport() {
  const navigate = useNavigate();

  const [rows, setRows]         = useState<ProductPerformanceRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterStorage, setFilterStorage] = useState("");
  const [filterBrand, setFilterBrand]     = useState("");
  const [sortBy, setSortBy]     = useState<"qty" | "expiry" | "velocity">("qty");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setRows(await getProductPerformance());
      } catch (e: any) {
        setError(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const brandOptions = useMemo(() => {
    const set = new Set(rows.map(r => r.brand).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [rows]);

  const storageOptions = useMemo(() => {
    const set = new Set(rows.map(r => r.storage_type).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let res = rows;
    if (filterStorage) res = res.filter(r => r.storage_type === filterStorage);
    if (filterBrand)   res = res.filter(r => r.brand === filterBrand);
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(r =>
        (r.name_en ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.item_code ?? "").toLowerCase().includes(q)
      );
    }
    // Sort
    if (sortBy === "qty")      res = [...res].sort((a, b) => b.available_quantity - a.available_quantity);
    if (sortBy === "velocity") res = [...res].sort((a, b) => b.outbound30d - a.outbound30d);
    if (sortBy === "expiry")   res = [...res].sort((a, b) => {
      if (!a.nearest_expiry && !b.nearest_expiry) return 0;
      if (!a.nearest_expiry) return 1;
      if (!b.nearest_expiry) return -1;
      return a.nearest_expiry.localeCompare(b.nearest_expiry);
    });
    return res;
  }, [rows, filterStorage, filterBrand, search, sortBy]);

  const zeroStock  = rows.filter(r => r.available_quantity <= 0).length;
  const nearExpiry = rows.filter(r => {
    const d = daysUntil(r.nearest_expiry);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const expired    = rows.filter(r => {
    const d = daysUntil(r.nearest_expiry);
    return d !== null && d < 0;
  }).length;

  const kpis: KpiItem[] = [
    { label: "Active SKUs", value: loading ? "—" : rows.length, icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", loading },
    { label: "Out of Stock", value: loading ? "—" : zeroStock, icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/8", border: "border-red-500/20", loading, trend: zeroStock > 0 ? "down" : "neutral" },
    { label: "Near Expiry (30d)", value: loading ? "—" : nearExpiry, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/20", loading, trend: nearExpiry > 0 ? "down" : "neutral" },
    { label: "Expired (in stock)", value: loading ? "—" : expired, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/8", border: "border-red-500/20", loading, trend: expired > 0 ? "down" : "neutral" },
  ];

  function handleExport() {
    exportExcel(
      filtered.map(r => ({
        Code:         r.code ?? "",
        Item_Code:    r.item_code ?? "",
        Name:         r.name_en ?? "",
        Brand:        r.brand ?? "",
        Category:     r.category ?? "",
        Storage:      r.storage_type ?? "",
        Available_Qty: r.available_quantity,
        Batches:      r.batch_count,
        Nearest_Expiry: r.nearest_expiry ?? "",
        Outbound_30d: r.outbound30d,
      })),
      "ProductPerformance"
    );
  }

  return (
    <DashboardShell
      icon={Package}
      title="Product Performance"
      subtitle="Stock levels, expiry status, and 30-day sales velocity"
      accent="emerald"
      headerAction={
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition"
        >
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      }
    >
      <KpiGrid items={kpis} />

      {/* Filters */}
      <SectionCard title="Search & Filter" icon={Search} iconClass="text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search name, code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <select
            value={filterStorage}
            onChange={e => setFilterStorage(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Storage Types</option>
            {storageOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterBrand}
            onChange={e => setFilterBrand(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Brands</option>
            {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="qty">Sort: Stock High–Low</option>
            <option value="expiry">Sort: Nearest Expiry</option>
            <option value="velocity">Sort: Most Moved (30d)</option>
          </select>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard title={`Products (${filtered.length})`} icon={Package} iconClass="text-emerald-400">
        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : loading ? (
          <LoadingRows rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} message="No products match the filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Code", "Product", "Storage", "Brand", "Available", "Batches", "Nearest Expiry", "Moved (30d)"].map(h => (
                    <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2 first:px-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const days   = daysUntil(r.nearest_expiry);
                  const StorageIcon = STORAGE_ICON[r.storage_type ?? ""] ?? Package;
                  return (
                    <tr
                      key={r.product_id}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => navigate(`/products/${r.product_id}/trace`)}
                    >
                      <td className="py-2.5 px-0 text-xs font-mono text-muted-foreground">{r.code ?? r.item_code ?? "—"}</td>
                      <td className="py-2.5 px-2 text-sm font-semibold text-foreground max-w-[200px] truncate">{r.name_en ?? "—"}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1">
                          <StorageIcon className={`w-3.5 h-3.5 shrink-0 ${STORAGE_COLOR[r.storage_type ?? ""] ?? "text-muted-foreground"}`} />
                          <span className="text-xs text-muted-foreground">{r.storage_type ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.brand ?? "—"}</td>
                      <td className="py-2.5 px-2">
                        <span className={`text-sm font-bold ${r.available_quantity <= 0 ? "text-red-400" : "text-foreground"}`}>
                          {r.available_quantity.toFixed(0)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.batch_count}</td>
                      <td className={`py-2.5 px-2 text-xs ${expiryClass(days)}`}>{expiryLabel(days)}</td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.outbound30d > 0 ? r.outbound30d.toFixed(0) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
