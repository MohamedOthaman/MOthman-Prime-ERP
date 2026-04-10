import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Search, RefreshCw, Play, ChevronRight,
  Clock, Loader2, Package,
} from "lucide-react";
import { fetchInvoiceList } from "@/features/invoices/salesInvoiceService";
import { toast } from "sonner";

type Invoice = Awaited<ReturnType<typeof fetchInvoiceList>>[number];

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PickingQueuePage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchInvoiceList({ status: "ready", limit: 200 });
      setInvoices(rows);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (inv.invoice_number ?? "").toLowerCase().includes(q) ||
      (inv.customer_name  ?? "").toLowerCase().includes(q) ||
      (inv.salesman_name  ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-foreground">Picking Queue</h1>
            <p className="text-[10px] text-muted-foreground">
              {loading ? "Loading…" : `${filtered.length} ready invoice${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invoice #, customer, salesman..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-15" />
            <p className="text-sm font-medium">Queue is empty</p>
            <p className="text-xs mt-1">No invoices in READY state</p>
          </div>
        ) : (
          filtered.map((inv) => (
            <div
              key={inv.id}
              className="rounded-2xl border border-amber-500/15 bg-card p-5 space-y-4"
            >
              {/* Invoice info */}
              <div className="flex items-start gap-3 justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-foreground">
                      #{inv.invoice_number ?? inv.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-500/10 border-amber-500/25">
                      READY
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-0.5">{inv.customer_name ?? "—"}</p>
                  {inv.salesman_name && (
                    <p className="text-xs text-muted-foreground">{inv.salesman_name}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-foreground">{fmtAED(inv.total_amount)}</p>
                  {inv.ready_at && (
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-amber-400 font-medium">{fmtDateTime(inv.ready_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons — large for warehouse use */}
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/warehouse/picking/${inv.id}`)}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 active:scale-95 transition"
                >
                  <Play className="w-4 h-4" />
                  Start Picking
                </button>
                <button
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="flex items-center justify-center w-14 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition"
                  title="View invoice details"
                >
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
