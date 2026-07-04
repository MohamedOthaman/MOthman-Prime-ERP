/**
 * StockReport — /reports/stock
 *
 * Operational inventory view: all batches with status, expiry, storage type.
 * Reuses getInventoryOperationalBatches() from warehouseInventoryService.
 */

import { useEffect, useState, useMemo } from "react";
import {
  Package, AlertTriangle, CheckCircle2, XCircle, Search, Download,
  ThermometerSnowflake, Flame, Wind,
} from "lucide-react";
import {
  getInventoryOperationalBatches,
  type InventoryOperationalBatchRow,
} from "@/features/services/warehouseInventoryService";
import { exportRowsExcel } from "@/lib/exportUtils";
import {
  DashboardShell,
  KpiGrid,
  SectionCard,
  EmptyState,
  LoadingRows,
  type KpiItem,
} from "@/components/dashboard/DashboardShell";
import { useLang } from "@/contexts/LanguageContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockReport() {
  const { t } = useLang();

  const [rows, setRows]         = useState<InventoryOperationalBatchRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterStorage, setFilterStorage] = useState("");
  const [filterStatus, setFilterStatus]   = useState("");

  // STATUS_STYLE defined inside component so labels are reactive to language
  const STATUS_STYLE = useMemo(() => ({
    available:   { label: t("available", "Available"),     cls: "text-emerald-400", dot: "bg-emerald-400" },
    near_expiry: { label: t("nearExpiry", "Near Expiry"),  cls: "text-amber-400",   dot: "bg-amber-400"   },
    expired:     { label: t("expired", "Expired"),         cls: "text-red-400",     dot: "bg-red-400"      },
  }), [t]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setRows(await getInventoryOperationalBatches());
      } catch (e: any) {
        setError(e.message ?? t("failedToLoad", "Failed to load"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const storageOptions = useMemo(() => {
    const set = new Set(rows.map(r => r.storage_type).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let res = rows;
    if (filterStorage) res = res.filter(r => r.storage_type === filterStorage);
    if (filterStatus)  res = res.filter(r => r.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(r =>
        (r.name_en ?? r.name ?? "").toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        (r.batch_no ?? "").toLowerCase().includes(q)
      );
    }
    return res;
  }, [rows, filterStorage, filterStatus, search]);

  const available   = rows.filter(r => r.status === "available").length;
  const nearExpiry  = rows.filter(r => r.status === "near_expiry").length;
  const expired     = rows.filter(r => r.status === "expired").length;

  const kpis: KpiItem[] = [
    { label: t("totalBatches", "Total Batches"), value: loading ? "—" : rows.length, icon: Package, color: "text-blue-400", bg: "bg-blue-500/8", border: "border-blue-500/20", loading },
    { label: t("available", "Available"), value: loading ? "—" : available, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", loading },
    { label: t("nearExpiry30d", "Near Expiry (30d)"), value: loading ? "—" : nearExpiry, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/20", loading, trend: nearExpiry > 0 ? "down" : "neutral" },
    { label: t("expired", "Expired"), value: loading ? "—" : expired, icon: XCircle, color: "text-red-400", bg: "bg-red-500/8", border: "border-red-500/20", loading, trend: expired > 0 ? "down" : "neutral" },
  ];

  function handleExport() {
    exportRowsExcel(
      filtered.map(r => ({
        Code:        r.code ?? "",
        Name:        r.name_en ?? r.name ?? "",
        Brand:       r.brand ?? "",
        Storage:     r.storage_type ?? "",
        Batch_No:    r.batch_no ?? "",
        Expiry:      fmtDate(r.expiry_date),
        Days_Left:   r.days_to_expiry ?? "",
        Available:   r.available_quantity,
        Status:      r.status,
        GRN_No:      r.grn_no ?? "",
      })),
      "StockReport"
    );
  }

  // Table column headers
  const tableHeaders = useMemo(() => [
    t("product", "Product"),
    t("storage", "Storage"),
    t("batchNo", "Batch No"),
    t("expiry", "Expiry"),
    t("daysLeft", "Days Left"),
    t("availableQty", "Available Qty"),
    t("status", "Status"),
    t("grn", "GRN"),
  ], [t]);

  return (
    <DashboardShell
      icon={Package}
      title={t("stockReport", "Stock Report")}
      subtitle={t("stockReportSubtitle", "All inventory batches — status, expiry, and quantities")}
      accent="cyan"
      headerAction={
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition"
        >
          <Download className="w-3.5 h-3.5" /> {t("export", "Export")}
        </button>
      }
    >
      <KpiGrid items={kpis} />

      {/* Filters */}
      <SectionCard title={t("filter", "Filter")} icon={Search} iconClass="text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={t("searchProductBatch", "Search product, batch...")}
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
            <option value="">{t("allStorageTypes", "All Storage Types")}</option>
            {storageOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t("allStatuses", "All Statuses")}</option>
            <option value="available">{t("available", "Available")}</option>
            <option value="near_expiry">{t("nearExpiry", "Near Expiry")}</option>
            <option value="expired">{t("expired", "Expired")}</option>
          </select>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard title={`${t("batches", "Batches")} (${filtered.length})`} icon={Package} iconClass="text-cyan-400">
        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : loading ? (
          <LoadingRows count={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} message={t("noDataFound", "No batches match the filter")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {tableHeaders.map(h => (
                    <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2 first:px-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const st = STATUS_STYLE[r.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.available;
                  const StorageIcon = STORAGE_ICON[r.storage_type ?? ""] ?? Package;
                  return (
                    <tr key={`${r.product_id}-${r.batch_no}-${i}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-0">
                        <p className="text-sm font-semibold text-foreground truncate max-w-[180px]">{r.name_en ?? r.name ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{r.code ?? r.item_code ?? ""}</p>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1">
                          <StorageIcon className={`w-3.5 h-3.5 shrink-0 ${STORAGE_COLOR[r.storage_type ?? ""] ?? "text-muted-foreground"}`} />
                          <span className="text-xs text-muted-foreground">{r.storage_type ?? "—"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{r.batch_no ?? "—"}</td>
                      <td className="py-2.5 px-2 text-xs text-foreground">{fmtDate(r.expiry_date)}</td>
                      <td className={`py-2.5 px-2 text-xs font-semibold ${st.cls}`}>
                        {r.days_to_expiry !== null ? (r.days_to_expiry < 0 ? `${Math.abs(r.days_to_expiry)}d ago` : `${r.days_to_expiry}d`) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-sm font-bold text-foreground">{r.available_quantity.toFixed(0)}</td>
                      <td className="py-2.5 px-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${st.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{r.grn_no ?? "—"}</td>
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
