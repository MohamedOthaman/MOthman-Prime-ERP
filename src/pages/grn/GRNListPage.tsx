import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { StatusBadge } from "@/components/workflow/StatusBadge";
import {
  fetchGrnQcQueue,
  type GrnQcQueueRow,
} from "@/features/services/grnQcService";

type QueueFilter = "all" | "qc" | "municipality" | "approved" | "completed";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function GRNListPage() {
  const navigate = useNavigate();
  const canGoBack = window.history.length > 1;
  const [rows, setRows] = useState<GrnQcQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const queueRows = await fetchGrnQcQueue();
        setRows(queueRows);
      } catch (loadError) {
        setRows([]);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load GRN queue."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const summary = useMemo(() => {
    return rows.reduce(
      (accumulator, row) => {
        if (row.status === "received") accumulator.awaitingQc += 1;
        if (row.status === "municipality_pending") accumulator.municipality += 1;
        if (row.hold_count > 0) accumulator.held += 1;
        if (row.status === "completed") accumulator.completed += 1;
        accumulator.pendingLines += row.pending_count;
        return accumulator;
      },
      { awaitingQc: 0, municipality: 0, held: 0, pendingLines: 0, completed: 0 }
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !value ||
        row.grn_no.toLowerCase().includes(value) ||
        (row.po_no || "").toLowerCase().includes(value) ||
        (row.supplier_name || "").toLowerCase().includes(value) ||
        (row.municipality_reference_no || "").toLowerCase().includes(value);

      const matchesFilter =
        filter === "all" ||
        (filter === "qc" &&
          (row.status === "received" ||
            row.status === "inspected" ||
            row.pending_count > 0 ||
            row.hold_count > 0)) ||
        (filter === "municipality" && row.status === "municipality_pending") ||
        (filter === "approved" && row.status === "approved") ||
        (filter === "completed" && row.status === "completed");

      return matchesSearch && matchesFilter;
    });
  }, [filter, rows, search]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl">
          <div className="mb-3 flex items-center gap-2">
            {canGoBack && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/50 transition shrink-0"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              GRN Operations
            </h1>

            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {filtered.length} / {rows.length}
            </span>

            <button
              type="button"
              onClick={() => navigate("/grn/new")}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New GRN
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by GRN, supplier, PO, or municipality ref..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                { key: "all", label: "All" },
                { key: "qc", label: "QC Queue" },
                { key: "municipality", label: "Municipality" },
                { key: "approved", label: "Approved" },
                { key: "completed", label: "Completed" },
              ] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  className={`h-10 rounded-md border px-3 text-sm font-medium transition ${
                    filter === option.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <section className="grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Awaiting QC
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {summary.awaitingQc}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Pending QC Lines
            </div>
            <div className="mt-2 text-2xl font-semibold text-amber-500">
              {summary.pendingLines}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Held GRNs
            </div>
            <div className="mt-2 text-2xl font-semibold text-destructive">
              {summary.held}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Municipality Pending
            </div>
            <div className="mt-2 text-2xl font-semibold text-primary">
              {summary.municipality}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Completed
            </div>
            <div className="mt-2 text-2xl font-semibold text-teal-500">
              {summary.completed}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-16 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">No GRNs match the current queue filter.</p>
          </div>
        ) : null}

        {!loading &&
          filtered.map((row) => (
            <section
              key={row.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{row.grn_no}</span>
                    <StatusBadge status={row.status} />
                    {row.pending_count > 0 ? (
                      <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                        {row.pending_count} pending
                      </span>
                    ) : null}
                    {row.hold_count > 0 ? (
                      <span className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500">
                        {row.hold_count} hold
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 text-xs md:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Supplier</p>
                      <p className="font-medium text-foreground">
                        {row.supplier_name || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">PO No</p>
                      <p className="font-medium text-foreground">{row.po_no || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Transaction Date</p>
                      <p className="font-medium text-foreground">
                        {formatDate(row.transaction_date || row.arrival_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Municipality Ref</p>
                      <p className="font-medium text-foreground">
                        {row.municipality_reference_no || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-4">
                    <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
                      <p className="text-muted-foreground">Lines</p>
                      <p className="font-semibold text-foreground">{row.line_count}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
                      <p className="text-muted-foreground">Pass</p>
                      <p className="font-semibold text-emerald-500">{row.pass_count}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
                      <p className="text-muted-foreground">Reject</p>
                      <p className="font-semibold text-destructive">{row.reject_count}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/60 px-3 py-2">
                      <p className="text-muted-foreground">Hold</p>
                      <p className="font-semibold text-amber-500">{row.hold_count}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <button
                    type="button"
                    onClick={() => navigate(`/grn/${row.id}`)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground"
                  >
                    GRN Details
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/grn/${row.id}/qc`)}
                    className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    QC Workflow
                  </button>
                </div>
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}
