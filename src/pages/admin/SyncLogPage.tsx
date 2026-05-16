import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useDatabase } from "@/database/DatabaseProvider";
import { discard, listAll, retryNow } from "@/sync/outbox";
import type { OutboxRecord } from "@/database/types";
import { toast } from "sonner";
import { useLang } from "@/contexts/LanguageContext";

function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { hour12: false });
}

export default function SyncLogPage() {
  const db = useDatabase();
  const { t } = useLang();
  const [rows, setRows] = useState<OutboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OutboxRecord["status"] | "all">("all");

  const STATUS_PILL: Record<OutboxRecord["status"], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = useMemo(() => ({
    pending:          { label: t("pending",       "Pending"),  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",       icon: Clock },
    in_flight:        { label: t("syncing",        "Syncing"),  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",           icon: RefreshCw },
    succeeded:        { label: t("synced",         "Synced"),   cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    failed_permanent: { label: t("failed",         "Failed"),   cls: "bg-red-500/10 text-red-400 border-red-500/20",             icon: AlertTriangle },
  }), [t]);

  const FILTER_LABELS: Record<OutboxRecord["status"] | "all", string> = useMemo(() => ({
    all:              t("all",              "All"),
    pending:          t("pending",          "Pending"),
    in_flight:        t("inFlight",         "In flight"),
    succeeded:        t("succeeded",        "Succeeded"),
    failed_permanent: t("failedPermanent",  "Failed permanent"),
  }), [t]);

  const refresh = async () => {
    setLoading(true);
    try {
      const all = await listAll(db);
      setRows(all);
    } catch (e: any) {
      toast.error(e.message ?? t("failedLoadOutbox", "Failed to load outbox"));
    }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, [db]);

  const handleRetry = async (id: string) => {
    await retryNow(db, id);
    await refresh();
    toast.success(t("queuedForRetry", "Queued for immediate retry"));
  };

  const handleDiscard = async (id: string) => {
    if (!confirm(t("discardConfirm", "Discard this sync entry? This cannot be undone."))) return;
    await discard(db, id);
    await refresh();
    toast.success(t("discarded", "Discarded"));
  };

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Activity className="w-5 h-5 text-violet-400 shrink-0" />
          <h1 className="text-[15px] font-bold text-foreground flex-1">{t("syncLog", "Sync Log")}</h1>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          {(["all", "pending", "in_flight", "succeeded", "failed_permanent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border whitespace-nowrap ${
                filter === s
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/30"
              }`}
            >
              {FILTER_LABELS[s]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-2">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {t("noOutboxEntries", "No outbox entries.")}
          </div>
        ) : (
          visible.map((r) => {
            const cfg = STATUS_PILL[r.status];
            const Icon = cfg.icon;
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${cfg.cls}`}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <span className="text-xs font-mono text-foreground flex-1 truncate">
                    {r.entity}:{r.op}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {fmtDateTime(r.createdAt)}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono break-all">
                  id: {r.id} · attempts: {r.attempts} · device: {r.deviceId.slice(0, 8)}
                </div>
                {r.lastError && (
                  <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5">
                    {r.lastError}
                  </div>
                )}
                {(r.status === "pending" || r.status === "failed_permanent") && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleRetry(r.id)}
                      className="text-[10px] px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium hover:bg-blue-500/20 transition inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t("retryNow", "Retry now")}
                    </button>
                    <button
                      onClick={() => handleDiscard(r.id)}
                      className="text-[10px] px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-medium hover:bg-red-500/20 transition inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t("discard", "Discard")}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
