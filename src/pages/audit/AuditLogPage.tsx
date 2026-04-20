/**
 * AuditLogPage — /audit
 *
 * Paginated, filterable view of the audit_logs table.
 * Access: admin tier and above (admin, ops_manager, ceo, gm, owner).
 *
 * Filters: entity_type, date range (from/to), action search.
 * Expanding a row shows old_value / new_value JSON diff.
 * Pagination: 50 rows per page.
 */

import { useEffect, useState } from "react";
import {
  ShieldCheck, Search, ChevronDown, ChevronRight, Clock, User, Filter,
} from "lucide-react";
import {
  getAuditLogsByFilter,
  type AuditLogRow,
  type AuditLogFilters,
} from "@/services/auditService";
import {
  DashboardShell,
  SectionCard,
  EmptyState,
  LoadingRows,
} from "@/components/dashboard/DashboardShell";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const ENTITY_OPTIONS = [
  { value: "",        label: "All Types"  },
  { value: "grn",     label: "GRN"        },
  { value: "invoice", label: "Invoice"    },
  { value: "product", label: "Product"    },
  { value: "user",    label: "User"       },
  { value: "system",  label: "System"     },
];

const ENTITY_COLOR: Record<string, string> = {
  grn:     "text-cyan-400   bg-cyan-500/10   border-cyan-500/20",
  invoice: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  product: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  user:    "text-blue-400   bg-blue-500/10   border-blue-500/20",
  system:  "text-muted-foreground bg-muted/30 border-border",
};

const ACTION_COLOR: Record<string, string> = {
  created:        "bg-blue-500",
  approved:       "bg-emerald-500",
  rejected:       "bg-red-500",
  status_changed: "bg-amber-500",
  updated:        "bg-muted-foreground",
  deleted:        "bg-red-700",
  activated:      "bg-emerald-400",
  deactivated:    "bg-red-400",
  role_changed:   "bg-violet-500",
};

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function actionDot(action: string) {
  return ACTION_COLOR[action] ?? "bg-muted-foreground";
}

function actionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── JSON Diff Panel ─────────────────────────────────────────────────────────

function JsonPanel({ label, value }: { label: string; value: Record<string, any> | null }) {
  if (!value) return null;
  return (
    <div className="flex-1 min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="rounded-lg border border-border bg-muted/30 p-3 text-[10px] text-foreground overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AuditRow({ row }: { row: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = row.old_value || row.new_value || row.metadata;
  const entityCls = ENTITY_COLOR[row.entity_type] ?? ENTITY_COLOR.system;

  return (
    <>
      <tr
        className={`border-b border-border/50 transition-colors ${hasDetail ? "cursor-pointer hover:bg-muted/20" : "hover:bg-muted/10"}`}
        onClick={() => hasDetail && setExpanded(v => !v)}
      >
        {/* Expand toggle */}
        <td className="py-2.5 px-0 w-6">
          {hasDetail
            ? (expanded
                ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />)
            : null
          }
        </td>
        {/* Timestamp */}
        <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap font-mono">
          {fmtDateTime(row.created_at)}
        </td>
        {/* Performed by */}
        <td className="py-2.5 px-2 text-xs text-foreground">
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-mono truncate max-w-[120px]">
              {row.metadata?.user_name || row.metadata?.user_email || (row.performed_by ? row.performed_by.slice(0, 8) + "…" : "—")}
            </span>
          </div>
        </td>
        {/* Entity type */}
        <td className="py-2.5 px-2">
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${entityCls}`}>
            {row.entity_type}
          </span>
        </td>
        {/* Action */}
        <td className="py-2.5 px-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${actionDot(row.action)}`} />
            {actionLabel(row.action)}
          </span>
        </td>
        {/* Entity ID */}
        <td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">
          {row.entity_id ? row.entity_id.slice(0, 8) + "…" : "—"}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && hasDetail && (
        <tr className="border-b border-border/50 bg-muted/10">
          <td colSpan={6} className="px-8 py-3">
            <div className="flex flex-wrap gap-4">
              {row.old_value && <JsonPanel label="Before" value={row.old_value} />}
              {row.new_value && <JsonPanel label="After"  value={row.new_value} />}
              {row.metadata  && !row.old_value && !row.new_value && (
                <JsonPanel label="Metadata" value={row.metadata} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [rows, setRows]       = useState<AuditLogRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Filters (committed on Apply)
  const [entityType, setEntityType]   = useState("");
  const [fromDate, setFromDate]       = useState("");
  const [toDate, setToDate]           = useState("");
  const [actionSearch, setActionSearch] = useState("");

  // Applied filters
  const [applied, setApplied] = useState<AuditLogFilters>({});

  async function fetchPage(filters: AuditLogFilters, offset: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditLogsByFilter(filters, PAGE_SIZE, offset);
      setRows(result.rows);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (e: any) {
      setError(e.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPage(applied, page * PAGE_SIZE);
  }, [applied, page]);

  function handleApply() {
    const f: AuditLogFilters = {};
    if (entityType)    f.entityType    = entityType;
    if (fromDate)      f.fromDate      = fromDate;
    if (toDate)        f.toDate        = toDate;
    if (actionSearch)  f.actionSearch  = actionSearch;
    setApplied(f);
    setPage(0);
  }

  function handleClear() {
    setEntityType("");
    setFromDate("");
    setToDate("");
    setActionSearch("");
    setApplied({});
    setPage(0);
  }

  const hasFilters = entityType || fromDate || toDate || actionSearch;
  const pageStart  = page * PAGE_SIZE + 1;
  const pageEnd    = page * PAGE_SIZE + rows.length;

  return (
    <DashboardShell
      icon={ShieldCheck}
      title="Audit Log"
      subtitle="Full system activity log — all recorded actions by users"
      accent="violet"
    >
      {/* Filters */}
      <SectionCard title="Filters" icon={Filter} iconClass="text-violet-400">
        <div className="flex flex-wrap items-end gap-3">
          {/* Entity type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Type</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Action search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Action</label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="e.g. status_changed"
                value={actionSearch}
                onChange={e => setActionSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleApply()}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleApply}
            className="rounded-lg border border-primary bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
          >
            Apply
          </button>
          {hasFilters && (
            <button
              onClick={handleClear}
              className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition"
            >
              Clear
            </button>
          )}
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard
        title={loading ? "Audit Entries" : `Audit Entries (${total.toLocaleString()} total)`}
        icon={Clock}
        iconClass="text-violet-400"
      >
        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-400">{error}</div>
        ) : loading ? (
          <LoadingRows count={10} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} message="No audit log entries match the filter" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 w-6" />
                    {["Timestamp", "Performed By", "Entity", "Action", "Entity ID"].map(h => (
                      <th key={h} className="pb-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => <AuditRow key={r.id} row={r} />)}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                Showing {pageStart}–{pageEnd} of {total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground font-mono">
                  Page {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasMore}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </DashboardShell>
  );
}
