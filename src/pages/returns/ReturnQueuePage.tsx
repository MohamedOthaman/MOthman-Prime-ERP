import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  RotateCcw, Search, RefreshCw, Plus, ChevronRight,
  Loader2, Package,
} from "lucide-react";
import {
  fetchReturnQueue,
  type SalesReturn,
  type ReturnStatus,
} from "@/features/invoices/returnsService";
import { toast } from "sonner";

const STATUS_TABS: { key: ReturnStatus | "all"; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "draft",    label: "Draft"    },
  { key: "received", label: "Received" },
  { key: "posted",   label: "Posted"   },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_CLS: Record<string, string> = {
  draft:     "text-muted-foreground bg-muted/20 border-border",
  received:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  reviewed:  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  posted:    "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/20",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtAED(n: number | null | undefined) {
  if (n == null) return "—";
  return `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReturnQueuePage() {
  const navigate = useNavigate();
  const [returns, setReturns]       = useState<SalesReturn[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<ReturnStatus | "all">("all");
  const [search, setSearch]         = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchReturnQueue({ limit: 300 });
      setReturns(rows);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = returns.filter((r) => {
    if (tab !== "all" && r.status !== tab) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (r.return_no ?? "").toLowerCase().includes(q) ||
      (r.invoice_number ?? "").toLowerCase().includes(q) ||
      (r.customer_name ?? "").toLowerCase().includes(q)
    );
  });

  // Per-status counts (computed from full unfiltered list)
  const counts: Record<string, number> = { all: returns.length };
  for (const r of returns) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-foreground">Returns</h1>
            <p className="text-[10px] text-muted-foreground">
              {loading ? "Loading…" : `${filtered.length} document${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => navigate("/returns/new")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            New Return
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="max-w-3xl mx-auto px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search return #, invoice #, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Status tabs with counts */}
        <div className="max-w-3xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((t) => {
            const count = counts[t.key] ?? 0;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted/30"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[9px] rounded-full px-1 min-w-[14px] text-center ${
                    isActive ? "bg-white/20" : "bg-muted/40"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-15" />
            <p className="text-sm font-medium">No returns found</p>
          </div>
        ) : (
          filtered.map((ret) => (
            <div
              key={ret.id}
              className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3 hover:bg-muted/10 transition cursor-pointer"
              onClick={() => navigate(`/returns/${ret.id}`)}
            >
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    {ret.return_no ?? ret.id.slice(0, 8)}
                  </span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_CLS[ret.status] ?? STATUS_CLS.draft}`}>
                    {ret.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-foreground">{ret.customer_name ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">
                  Invoice #{ret.invoice_number ?? "—"} · {fmtDate(ret.created_at)}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-xs font-semibold text-foreground">{fmtAED(ret.total_amount)}</p>
                {ret.posted_at && (
                  <p className="text-[10px] text-emerald-400">Posted {fmtDate(ret.posted_at)}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          ))
        )}
      </main>
    </div>
  );
}
