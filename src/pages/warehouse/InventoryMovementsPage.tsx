import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ClipboardList,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  fetchInventoryMovementsLog,
  type InventoryMovementLogRow,
} from "@/features/services/warehouseInventoryService";

const PAGE_SIZE = 100;

type MovementTypeFilter = "ALL" | "INBOUND" | "OUTBOUND" | "RETURN" | "ADJUSTMENT";

const TYPE_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
  icon: "in" | "out" | "return" | "adjust";
}> = {
  INBOUND:    { label: "Inbound",    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500", icon: "in" },
  OUTBOUND:   { label: "Outbound",   badgeClass: "border-red-500/30 bg-red-500/10 text-red-500",             icon: "out" },
  RETURN:     { label: "Return",     badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-500",           icon: "return" },
  ADJUSTMENT: { label: "Adjustment", badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-500",        icon: "adjust" },
  TRANSFER:   { label: "Transfer",   badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-500",     icon: "adjust" },
};

function MovementIcon({ icon }: { icon: string }) {
  if (icon === "in")     return <ArrowDown className="h-3.5 w-3.5 text-emerald-500" />;
  if (icon === "out")    return <ArrowUp className="h-3.5 w-3.5 text-red-500" />;
  if (icon === "return") return <RotateCcw className="h-3.5 w-3.5 text-blue-500" />;
  return <ClipboardList className="h-3.5 w-3.5 text-amber-500" />;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateShort(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function InventoryMovementsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InventoryMovementLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>("ALL");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchInventoryMovementsLog({
          movementType: typeFilter === "ALL" ? undefined : typeFilter,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        setRows(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load movements.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [typeFilter, fromDate, toDate, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [typeFilter, fromDate, toDate]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      (r.product_name || "").toLowerCase().includes(term) ||
      (r.product_code || "").toLowerCase().includes(term) ||
      (r.batch_no || "").toLowerCase().includes(term) ||
      (r.grn_no || "").toLowerCase().includes(term) ||
      (r.invoice_no || "").toLowerCase().includes(term) ||
      (r.notes || "").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    return rows.reduce(
      (s, r) => {
        if (r.movement_type === "INBOUND")    s.inbound  += r.qty_in;
        if (r.movement_type === "OUTBOUND")   s.outbound += r.qty_out;
        if (r.movement_type === "RETURN")     s.returned += r.qty_in;
        return s;
      },
      { inbound: 0, outbound: 0, returned: 0 }
    );
  }, [rows]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              Inventory Movements
            </h1>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {filtered.length} / {rows.length} shown
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Type filter tabs */}
            {(["ALL", "INBOUND", "OUTBOUND", "RETURN", "ADJUSTMENT"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`h-8 rounded-md border px-3 text-xs font-medium transition ${
                  typeFilter === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {t === "ALL" ? "All Types" : (TYPE_CONFIG[t]?.label ?? t)}
              </button>
            ))}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Date range */}
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
              />
            </div>
          </div>

          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product, batch, GRN, invoice, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {/* Summary cards */}
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <ArrowDown className="h-4 w-4 text-emerald-500" />
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Total Inbound
              </span>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-emerald-500">
              +{summary.inbound.toFixed(3)}
            </div>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-red-500" />
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Total Outbound
              </span>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-red-500">
              -{summary.outbound.toFixed(3)}
            </div>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-blue-500" />
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Total Returned
              </span>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-blue-500">
              +{summary.returned.toFixed(3)}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {!loading && !error && (
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-secondary/50 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2 text-right">Qty In</th>
                    <th className="px-3 py-2 text-right">Qty Out</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-sm text-muted-foreground">
                        No movements found for the selected filters.
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map((row) => {
                    const cfg = TYPE_CONFIG[row.movement_type] ?? {
                      label: row.movement_type,
                      badgeClass: "border-border bg-secondary text-foreground",
                      icon: "adjust",
                    };
                    const ref = row.grn_no
                      ? `GRN ${row.grn_no}`
                      : row.invoice_no
                      ? `INV ${row.invoice_no}`
                      : row.reference_type
                      ? `${row.reference_type} ${row.reference_id?.slice(0, 6) ?? ""}…`
                      : "-";

                    return (
                      <tr key={row.id} className="border-t border-border/60 align-top hover:bg-secondary/30">
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDate(row.performed_at)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${cfg.badgeClass}`}>
                            <MovementIcon icon={cfg.icon} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/products/${row.product_id}/trace`)}
                            className="text-left group"
                          >
                            <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {row.product_name || row.product_code || row.product_id.slice(0, 8)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.product_code || ""}{row.uom ? ` · ${row.uom}` : ""}
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.batch_id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/stock/batch/${row.batch_id}`)}
                              className="text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
                            >
                              {row.batch_no || row.batch_id.slice(0, 8)}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{row.batch_no || "-"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {formatDateShort(row.expiry_date)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-emerald-500">
                          {row.qty_in > 0 ? `+${row.qty_in.toFixed(3)}` : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-red-500">
                          {row.qty_out > 0 ? `-${row.qty_out.toFixed(3)}` : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                          {row.balance_after != null ? row.balance_after.toFixed(3) : "-"}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">
                          {ref}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.location_ref || "-"}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground" title={row.notes ?? ""}>
                          {row.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <span>
                Page {page + 1} · {rows.length} records loaded
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded border border-border bg-card px-3 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={rows.length < PAGE_SIZE || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-border bg-card px-3 py-1 text-xs font-medium text-foreground disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
