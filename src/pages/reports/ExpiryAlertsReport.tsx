/**
 * ExpiryAlertsReport — /reports/expiry
 *
 * Three urgency tiers (7d / 14d / 30d) plus expired items.
 * Reuses getInventoryExpiryAlerts() + getInventoryOperationalBatches()
 * from warehouseInventoryService.
 */

import { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle, Package, ThermometerSnowflake, Flame, Wind, Download, ShieldAlert,
} from "lucide-react";
import {
  getInventoryExpiryAlerts,
  getInventoryOperationalBatches,
  type InventoryExpiryAlertBucket,
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

// ─── Sub-component: Bucket Table ─────────────────────────────────────────────

interface BucketTableProps {
  items: InventoryOperationalBatchRow[];
  rowClass: (r: InventoryOperationalBatchRow) => string;
  daysLabel: (r: InventoryOperationalBatchRow) => string;
  headers: string[];
}

function BucketTable({ items, rowClass, daysLabel, headers }: BucketTableProps) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {headers.map(h => (
              <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2 first:px-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => {
            const StorageIcon = STORAGE_ICON[r.storage_type ?? ""] ?? Package;
            return (
              <tr key={`${r.product_id}-${r.batch_no}-${i}`} className={`border-b border-border/50 transition-colors ${rowClass(r)}`}>
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
                <td className="py-2.5 px-2 text-xs font-semibold">{daysLabel(r)}</td>
                <td className="py-2.5 px-2 text-sm font-bold text-foreground">{r.available_quantity.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpiryAlertsReport() {
  const { t } = useLang();

  const [buckets, setBuckets]   = useState<InventoryExpiryAlertBucket[]>([]);
  const [expired, setExpired]   = useState<InventoryOperationalBatchRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [alerts, all] = await Promise.all([
          getInventoryExpiryAlerts(),
          getInventoryOperationalBatches(),
        ]);
        setBuckets(alerts);
        setExpired(all.filter(r => r.status === "expired"));
      } catch (e: any) {
        setError(e.message ?? t("failedToLoad", "Failed to load"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const b7  = buckets.find(b => b.threshold_days === 7);
  const b14 = buckets.find(b => b.threshold_days === 14);
  const b30 = buckets.find(b => b.threshold_days === 30);

  const kpis: KpiItem[] = [
    { label: t("expiredInStock", "Expired (in stock)"),   value: loading ? "—" : expired.length,       icon: ShieldAlert,     color: "text-red-400",    bg: "bg-red-500/8",    border: "border-red-500/20",    loading, trend: expired.length > 0 ? "down" : "neutral" },
    { label: t("expiring7d", "Expiring ≤ 7 days"),        value: loading ? "—" : (b7?.batch_count ?? 0),  icon: AlertTriangle,   color: "text-red-400",    bg: "bg-red-500/8",    border: "border-red-500/20",    loading, trend: (b7?.batch_count ?? 0) > 0 ? "down" : "neutral" },
    { label: t("expiring14d", "Expiring ≤ 14 days"),      value: loading ? "—" : (b14?.batch_count ?? 0), icon: AlertTriangle,   color: "text-orange-400", bg: "bg-orange-500/8", border: "border-orange-500/20", loading, trend: (b14?.batch_count ?? 0) > 0 ? "down" : "neutral" },
    { label: t("expiring30d", "Expiring ≤ 30 days"),      value: loading ? "—" : (b30?.batch_count ?? 0), icon: AlertTriangle,   color: "text-amber-400",  bg: "bg-amber-500/8",  border: "border-amber-500/20",  loading, trend: (b30?.batch_count ?? 0) > 0 ? "down" : "neutral" },
  ];

  const bucketTableHeaders = useMemo(() => [
    t("product", "Product"),
    t("storage", "Storage"),
    t("batchNo", "Batch No"),
    t("expiry", "Expiry"),
    t("daysLeft", "Days Left"),
    t("qtyAvailable", "Qty Available"),
  ], [t]);

  function handleExport() {
    const rows: InventoryOperationalBatchRow[] = [
      ...expired,
      ...(b30?.items ?? []),
    ];
    // Deduplicate by product_id + batch_no
    const seen = new Set<string>();
    const unique = rows.filter(r => {
      const key = `${r.product_id}:${r.batch_no}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    exportRowsExcel(
      unique.map(r => ({
        Code:          r.code ?? "",
        Name:          r.name_en ?? r.name ?? "",
        Brand:         r.brand ?? "",
        Storage:       r.storage_type ?? "",
        Batch_No:      r.batch_no ?? "",
        Expiry:        fmtDate(r.expiry_date),
        Days_Left:     r.days_to_expiry !== null ? (r.days_to_expiry < 0 ? `Expired (${Math.abs(r.days_to_expiry)}d ago)` : `${r.days_to_expiry}d`) : "—",
        Available_Qty: r.available_quantity,
        Status:        r.status,
        GRN_No:        r.grn_no ?? "",
      })),
      "ExpiryAlerts"
    );
  }

  // Items in ≤14d but NOT in ≤7d (exclusive 8–14d band)
  const items7to14 = (b14?.items ?? []).filter(
    r => (r.days_to_expiry ?? 99) > 7
  );
  // Items in ≤30d but NOT in ≤14d (exclusive 15–30d band)
  const items15to30 = (b30?.items ?? []).filter(
    r => (r.days_to_expiry ?? 99) > 14
  );

  return (
    <DashboardShell
      icon={AlertTriangle}
      title={t("expiryAlerts", "Expiry Alerts")}
      subtitle={t("expiryAlertsSubtitle", "Batches expiring within 7, 14, and 30 days — plus expired stock")}
      accent="red"
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

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
      )}

      {/* Expired stock — highest urgency */}
      <SectionCard
        title={`${t("expired", "Expired")} (${expired.length})`}
        icon={ShieldAlert}
        iconClass="text-red-400"
      >
        {loading ? <LoadingRows count={4} /> : expired.length === 0 ? (
          <EmptyState icon={Package} message={t("noExpiredBatches", "No expired batches in stock")} />
        ) : (
          <BucketTable
            items={expired}
            headers={bucketTableHeaders}
            rowClass={() => "bg-red-500/5 hover:bg-red-500/10"}
            daysLabel={r => r.days_to_expiry !== null ? `${Math.abs(r.days_to_expiry)}d ago` : "—"}
          />
        )}
      </SectionCard>

      {/* Critical ≤ 7 days */}
      <SectionCard
        title={`${t("criticalExpiring7d", "Critical — Expiring in ≤ 7 days")} (${b7?.batch_count ?? 0} ${t("batches", "batches")} · ${b7?.product_count ?? 0} ${t("products", "products")})`}
        icon={AlertTriangle}
        iconClass="text-red-400"
      >
        {loading ? <LoadingRows count={4} /> : (b7?.items ?? []).length === 0 ? (
          <EmptyState icon={Package} message={t("noBatchesExpiring7d", "No batches expiring within 7 days")} />
        ) : (
          <BucketTable
            items={b7!.items}
            headers={bucketTableHeaders}
            rowClass={() => "hover:bg-red-500/5"}
            daysLabel={r => r.days_to_expiry !== null ? `${r.days_to_expiry}d` : "—"}
          />
        )}
      </SectionCard>

      {/* Warning 8–14 days */}
      <SectionCard
        title={`${t("warningExpiring8to14d", "Warning — Expiring in 8–14 days")} (${items7to14.length} ${t("batches", "batches")})`}
        icon={AlertTriangle}
        iconClass="text-orange-400"
      >
        {loading ? <LoadingRows count={4} /> : items7to14.length === 0 ? (
          <EmptyState icon={Package} message={t("noBatchesInWindow", "No batches expiring in this window")} />
        ) : (
          <BucketTable
            items={items7to14}
            headers={bucketTableHeaders}
            rowClass={() => "hover:bg-orange-500/5"}
            daysLabel={r => r.days_to_expiry !== null ? `${r.days_to_expiry}d` : "—"}
          />
        )}
      </SectionCard>

      {/* Notice 15–30 days */}
      <SectionCard
        title={`${t("noticeExpiring15to30d", "Notice — Expiring in 15–30 days")} (${items15to30.length} ${t("batches", "batches")})`}
        icon={AlertTriangle}
        iconClass="text-amber-400"
      >
        {loading ? <LoadingRows count={4} /> : items15to30.length === 0 ? (
          <EmptyState icon={Package} message={t("noBatchesInWindow", "No batches expiring in this window")} />
        ) : (
          <BucketTable
            items={items15to30}
            headers={bucketTableHeaders}
            rowClass={() => "hover:bg-amber-500/5"}
            daysLabel={r => r.days_to_expiry !== null ? `${r.days_to_expiry}d` : "—"}
          />
        )}
      </SectionCard>
    </DashboardShell>
  );
}
