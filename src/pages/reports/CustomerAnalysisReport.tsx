/**
 * CustomerAnalysisReport — /reports/customers
 *
 * Searchable customer analysis: invoice count, revenue, salesman assignment.
 * Reuses getCustomerAnalysis() from reportService.
 */

import { useEffect, useState, useMemo } from "react";
import { Building2, Users, AlertTriangle, DollarSign, Search, Download, UserSquare2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCustomerAnalysis, type CustomerAnalysisRow } from "@/features/services/reportService";
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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerAnalysisReport() {
  const navigate = useNavigate();

  const [rows, setRows]       = useState<CustomerAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [filterSalesman, setFilterSalesman] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getCustomerAnalysis();
        setRows(data);
      } catch (e: any) {
        setError(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Unique salesmen for filter dropdown
  const salesmenOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string; name: string }[] = [];
    for (const r of rows) {
      if (r.salesmanId && r.salesmanName && !seen.has(r.salesmanId)) {
        seen.add(r.salesmanId);
        opts.push({ id: r.salesmanId, name: r.salesmanName });
      }
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    let res = rows;
    if (filterSalesman === "__none__") res = res.filter(r => !r.salesmanId);
    else if (filterSalesman)           res = res.filter(r => r.salesmanId === filterSalesman);
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.area ?? "").toLowerCase().includes(q)
      );
    }
    return res;
  }, [rows, search, filterSalesman]);

  const unassigned = rows.filter(r => !r.salesmanId).length;
  const withInvoices = rows.filter(r => r.invoiceCount > 0).length;
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);

  const kpis: KpiItem[] = [
    { label: "Total Customers", value: loading ? "—" : rows.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-500/8", border: "border-blue-500/20", loading },
    { label: "With Invoices", value: loading ? "—" : withInvoices, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20", loading },
    { label: "Unassigned", value: loading ? "—" : unassigned, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/20", loading, trend: unassigned > 0 ? "down" : "neutral" },
    { label: "Total Revenue (KWD)", value: loading ? "—" : totalRevenue.toFixed(0), icon: DollarSign, color: "text-violet-400", bg: "bg-violet-500/8", border: "border-violet-500/20", loading },
  ];

  function handleExport() {
    exportExcel(
      filtered.map(r => ({
        Code:             r.code,
        Name:             r.name,
        Name_AR:          r.name_ar ?? "",
        Area:             r.area ?? "",
        Type:             r.type ?? "",
        Salesman:         r.salesmanName ?? "Unassigned",
        Invoices:         r.invoiceCount,
        Revenue_KWD:      r.totalRevenue.toFixed(3),
        Last_Invoice:     fmtDate(r.lastInvoiceDate),
      })),
      "CustomerAnalysis"
    );
  }

  return (
    <DashboardShell
      icon={Building2}
      title="Customer Analysis"
      subtitle="Revenue, invoice history, and salesman assignments"
      accent="blue"
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
      <SectionCard title="Search & Filter" icon={Search} iconClass="text-blue-400">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] rounded-lg border border-border bg-background px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search name, code, area..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <select
            value={filterSalesman}
            onChange={e => setFilterSalesman(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Salesmen</option>
            <option value="__none__">Unassigned</option>
            {salesmenOptions.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard
        title={`Customers (${filtered.length})`}
        icon={Users}
        iconClass="text-blue-400"
      >
        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : loading ? (
          <LoadingRows rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Building2} message="No customers match the filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Code", "Customer", "Area", "Salesman", "Invoices", "Revenue (KWD)", "Last Invoice"].map(h => (
                    <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2 first:px-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/customers/${r.id}`)}
                  >
                    <td className="py-2.5 px-0 text-xs font-mono text-muted-foreground">{r.code}</td>
                    <td className="py-2.5 px-2">
                      <p className="text-sm font-semibold text-foreground">{r.name}</p>
                      {r.name_ar && <p className="text-[10px] text-muted-foreground">{r.name_ar}</p>}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.area ?? "—"}</td>
                    <td className="py-2.5 px-2">
                      {r.salesmanName
                        ? <span className="text-xs text-foreground">{r.salesmanName}</span>
                        : <span className="text-xs text-amber-400">Unassigned</span>
                      }
                    </td>
                    <td className="py-2.5 px-2 text-sm text-foreground">{r.invoiceCount}</td>
                    <td className="py-2.5 px-2 text-sm font-semibold text-foreground">{r.totalRevenue.toFixed(3)}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.lastInvoiceDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
