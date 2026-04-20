/**
 * InvoiceListPage — hub for the full invoice lifecycle.
 *
 * Status tabs: All | Ready | Done | Received | Cancelled | Returns
 * Each row exposes inline lifecycle actions where permitted.
 * Phase 2 core page — replaces the old /invoice-entry as the nav destination.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Search, RefreshCw, FileText, CheckCircle2,
  Truck, XCircle, RotateCcw, Clock, Loader2, ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useSalesmanScope } from "@/hooks/useSalesmanScope";
import {
  cancelInvoice,
  fetchInvoiceList,
  markInvoiceDone,
  markInvoiceReceived,
  type SalesInvoiceStatus,
} from "@/features/invoices/salesInvoiceService";
import { toast } from "sonner";

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SalesInvoiceStatus | "all",
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  all:       { label: "All",       color: "text-foreground",       bg: "bg-muted/30",           border: "border-border",           icon: FileText    },
  draft:     { label: "Draft",     color: "text-muted-foreground", bg: "bg-muted/20",           border: "border-border",           icon: FileText    },
  ready:     { label: "Ready",     color: "text-amber-400",        bg: "bg-amber-500/10",       border: "border-amber-500/20",     icon: Clock       },
  done:      { label: "Done",      color: "text-blue-400",         bg: "bg-blue-500/10",        border: "border-blue-500/20",      icon: Truck       },
  received:  { label: "Received",  color: "text-emerald-400",      bg: "bg-emerald-500/10",     border: "border-emerald-500/20",   icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "text-red-400",          bg: "bg-red-500/10",         border: "border-red-500/20",       icon: XCircle     },
  returns:   { label: "Returns",   color: "text-violet-400",       bg: "bg-violet-500/10",      border: "border-violet-500/20",    icon: RotateCcw   },
  posted:    { label: "Posted",    color: "text-emerald-400",      bg: "bg-emerald-500/10",     border: "border-emerald-500/20",   icon: CheckCircle2 },
};

const TABS: (SalesInvoiceStatus | "all")[] = ["all", "ready", "done", "received", "draft", "cancelled", "returns"];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ─────────────────────────────────────────────────────────────

type Invoice = Awaited<ReturnType<typeof fetchInvoiceList>>[number];

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const { isAdmin, isManager, canManageInvoices, role } = usePermissions();
  const { salesmanId, loading: scopeLoading } = useSalesmanScope();

  const [tab, setTab]           = useState<SalesInvoiceStatus | "all">("all");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [acting, setActing]     = useState<Record<string, boolean>>({});
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const isSalesmanRole = role === "salesman" || role === "sales";

  const load = useCallback(async () => {
    // Wait for salesman scope to resolve before fetching — avoids briefly exposing
    // the full invoice list to scoped users while the hook is still querying.
    if (isSalesmanRole && scopeLoading) return;

    setLoading(true);
    try {
      const rows = await fetchInvoiceList({
        status: tab,
        limit: 200,
        salesmanId: isSalesmanRole ? salesmanId : null,
      });
      setInvoices(rows);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, [tab, isSalesmanRole, salesmanId, scopeLoading]);

  useEffect(() => { void load(); }, [load]);

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (inv.invoice_number ?? "").toLowerCase().includes(q) ||
      (inv.customer_name  ?? "").toLowerCase().includes(q) ||
      (inv.salesman_name  ?? "").toLowerCase().includes(q)
    );
  });

  const busy = (id: string) => !!acting[id];
  const setBusy = (id: string, v: boolean) => setActing(prev => ({ ...prev, [id]: v }));

  const handleMarkDone = async (inv: Invoice) => {
    setBusy(inv.id, true);
    try {
      await markInvoiceDone(inv.id);
      toast.success(`Invoice ${inv.invoice_number ?? inv.id.slice(0,8)} marked DONE`);
      void load();
    } catch (e: any) { toast.error(e.message); }
    setBusy(inv.id, false);
  };

  const handleMarkReceived = async (inv: Invoice) => {
    setBusy(inv.id, true);
    try {
      await markInvoiceReceived(inv.id);
      toast.success(`Invoice ${inv.invoice_number ?? inv.id.slice(0,8)} marked RECEIVED`);
      void load();
    } catch (e: any) { toast.error(e.message); }
    setBusy(inv.id, false);
  };

  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { toast.error("Cancel reason required"); return; }
    setBusy(cancelTarget.id, true);
    try {
      await cancelInvoice(cancelTarget.id, cancelReason);
      toast.success(`Invoice ${cancelTarget.invoice_number ?? "—"} cancelled`);
      setCancelTarget(null);
      setCancelReason("");
      void load();
    } catch (e: any) {
      const err = e as Error & { code?: string };
      if (err.code === "14_DAY_RULE") {
        toast.error("14-day rule: use Returns workflow instead", { duration: 5000 });
      } else {
        toast.error(err.message);
      }
    }
    cancelTarget && setBusy(cancelTarget.id, false);
  };

  // Count per tab for badges
  const counts = invoices.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-400 shrink-0" />
          <h1 className="text-[15px] font-bold text-foreground flex-1">Invoices</h1>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
          {canManageInvoices && (
            <button
              onClick={() => navigate("/invoice-entry")}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map(t => {
              const cfg = STATUS_CONFIG[t];
              const count = t === "all" ? invoices.length : (counts[t] ?? 0);
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                    active
                      ? `${cfg.bg} ${cfg.color} ${cfg.border}`
                      : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/30"
                  }`}
                >
                  {cfg.label}
                  {count > 0 && (
                    <span className={`text-[10px] font-mono rounded-full px-1.5 py-0.5 ${active ? cfg.bg : "bg-muted/50"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search invoice #, customer, salesman..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No invoices found</p>
            {tab !== "all" && (
              <button onClick={() => setTab("all")} className="text-xs text-primary mt-2 hover:underline">
                Show all →
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {filtered.map((inv, i) => {
              const cfg  = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft;
              const Icon = cfg.icon;
              const isBusy = busy(inv.id);

              return (
                <div
                  key={inv.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  {/* Status icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-foreground">
                        #{inv.invoice_number ?? inv.id.slice(0, 8)}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {inv.customer_name ?? "—"}
                      {inv.salesman_name ? ` · ${inv.salesman_name}` : ""}
                      {" · "}
                      {fmtDate(inv.invoice_date)}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-foreground">{fmtAED(inv.total_amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(inv.created_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Warehouse: READY → DONE */}
                    {inv.status === "ready" && (isAdmin || isManager) && (
                      <button
                        onClick={() => handleMarkDone(inv)}
                        disabled={isBusy}
                        className="text-[10px] px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium hover:bg-blue-500/20 transition disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Mark Done"}
                      </button>
                    )}

                    {/* DONE → RECEIVED */}
                    {inv.status === "done" && (isAdmin || isManager) && (
                      <button
                        onClick={() => handleMarkReceived(inv)}
                        disabled={isBusy}
                        className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium hover:bg-emerald-500/20 transition disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Received"}
                      </button>
                    )}

                    {/* Cancel — available for ready/done/received (with 14d rule) */}
                    {["ready", "done", "received"].includes(inv.status) && isAdmin && (
                      <button
                        onClick={() => { setCancelTarget(inv); setCancelReason(""); }}
                        disabled={isBusy}
                        className="text-[10px] px-2 py-1 rounded border border-red-500/20 bg-red-500/8 text-red-400 font-medium hover:bg-red-500/15 transition disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    )}

                    {/* Open detail */}
                    <button
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="p-1 rounded hover:bg-muted/50 transition"
                    >
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cancel modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Cancel Invoice</h2>
              <p className="text-xs text-muted-foreground mt-1">
                #{cancelTarget.invoice_number ?? "—"} · {cancelTarget.customer_name ?? "—"}
              </p>
              {cancelTarget.status === "received" && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2">
                  <span className="text-[11px] text-amber-400">
                    This invoice is RECEIVED. Cancellation is only allowed within 14 days of receipt.
                  </span>
                </div>
              )}
            </div>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Enter cancel reason (required)..."
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCancelTarget(null); setCancelReason(""); }}
                className="flex-1 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/30 transition"
              >
                Back
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={busy(cancelTarget.id) || !cancelReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy(cancelTarget.id) ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
