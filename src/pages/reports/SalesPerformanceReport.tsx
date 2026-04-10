/**
 * SalesPerformanceReport — /reports/sales
 *
 * Per-salesman revenue ranking with invoice breakdown.
 * Date-range filterable. Reuses getSalesPerformance() from reportService.
 */

import { useEffect, useState } from "react";
import { TrendingUp, UserSquare2, FileText, DollarSign, BarChart3, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSalesPerformance, type SalesmanPerformanceRow } from "@/features/services/reportService";
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

function fmtKwd(n: number) {
  return `KWD ${n.toLocaleString("en", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesPerformanceReport() {
  const navigate = useNavigate();

  const [rows, setRows]         = useState<SalesmanPerformanceRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate]     = useState("");

  async function load(from = fromDate, to = toDate) {
    setLoading(true);
    setError(null);
    try {
      const data = await getSalesPerformance(from || undefined, to || undefined);
      setRows(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totalRevenue   = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalInvoices  = rows.reduce((s, r) => s + r.totalInvoices, 0);
  const activeSalesmen = rows.filter(r => r.totalInvoices > 0).length;
  const maxRevenue     = rows[0]?.totalRevenue ?? 1;

  const kpis: KpiItem[] = [
    { label: "Total Revenue", value: `KWD ${fmtShort(totalRevenue)}`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", loading },
    { label: "Total Invoices", value: loading ? "—" : totalInvoices, icon: FileText, color: "text-blue-400", bg: "bg-blue-500/8", border: "border-blue-500/20", loading },
    { label: "Active Salesmen", value: loading ? "—" : activeSalesmen, icon: UserSquare2, color: "text-violet-400", bg: "bg-violet-500/8", border: "border-violet-500/20", loading },
    { label: "Avg per Invoice", value: totalInvoices > 0 ? `KWD ${fmtShort(totalRevenue / totalInvoices)}` : "—", icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/20", loading },
  ];

  function handleExport() {
    exportExcel(
      rows.map((r, i) => ({
        Rank:          i + 1,
        Name:          r.name,
        Code:          r.code ?? "",
        Invoices:      r.totalInvoices,
        Done:          r.doneInvoices,
        Revenue_KWD:   r.totalRevenue.toFixed(3),
        Avg_Invoice:   r.avgInvoiceValue.toFixed(3),
      })),
      "SalesPerformance"
    );
  }

  return (
    <DashboardShell
      icon={TrendingUp}
      title="Sales Performance"
      subtitle="Per-salesman revenue & invoice breakdown"
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

      {/* Date filters */}
      <SectionCard title="Filter by Date Range" icon={BarChart3} iconClass="text-blue-400">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-primary bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition disabled:opacity-50"
          >
            Apply
          </button>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); void load("", ""); }}
              className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition"
            >
              Clear
            </button>
          )}
        </div>
      </SectionCard>

      {/* Rankings table */}
      <SectionCard title="Salesman Rankings" icon={UserSquare2} iconClass="text-violet-400">
        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : loading ? (
          <LoadingRows rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={UserSquare2} message="No salesmen found" sub="Create salesmen in the Salesmen module" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["#", "Salesman", "Code", "Invoices", "Done", "Revenue (KWD)", "Avg", "Share"].map(h => (
                    <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2 first:px-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const pct = maxRevenue > 0 ? (r.totalRevenue / maxRevenue) * 100 : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-0 text-xs font-mono text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 px-2 text-sm font-semibold text-foreground">{r.name}</td>
                      <td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{r.code ?? "—"}</td>
                      <td className="py-2.5 px-2 text-sm text-foreground">{r.totalInvoices}</td>
                      <td className="py-2.5 px-2 text-xs text-emerald-400">{r.doneInvoices}</td>
                      <td className="py-2.5 px-2 text-sm font-semibold text-foreground">{r.totalRevenue.toFixed(3)}</td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.avgInvoiceValue.toFixed(0)}</td>
                      <td className="py-2.5 px-2 w-24">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="py-2 px-0 text-[10px] font-semibold text-muted-foreground uppercase" colSpan={3}>Total</td>
                  <td className="py-2 px-2 text-sm font-bold text-foreground">{totalInvoices}</td>
                  <td className="py-2 px-2 text-xs text-emerald-400">{rows.reduce((s, r) => s + r.doneInvoices, 0)}</td>
                  <td className="py-2 px-2 text-sm font-bold text-foreground">{totalRevenue.toFixed(3)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
