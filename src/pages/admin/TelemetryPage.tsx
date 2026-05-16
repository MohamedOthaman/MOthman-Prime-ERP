import { useState } from "react";
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useTelemetrySnapshot } from "@/telemetry/useTelemetry";
import { metrics } from "@/telemetry/metrics";
import { useBootstrapCache } from "@/offline/useBootstrapCache";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { useLang } from "@/contexts/LanguageContext";

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "muted" | "green" | "amber" | "red" | "blue";
}) {
  const toneClass = {
    muted: "text-muted-foreground",
    green: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    blue: "text-blue-400",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${toneClass}`} />
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function TelemetryPage() {
  const { snap, tableCounts, outbox, storage } = useTelemetrySnapshot(3_000);
  const offline = useOfflineStatus();
  const bootstrap = useBootstrapCache();
  const [forcing, setForcing] = useState(false);
  const { t } = useLang();

  const handleForceRefresh = async () => {
    setForcing(true);
    try {
      await bootstrap.refresh({ force: true });
    } finally {
      setForcing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Activity className="w-5 h-5 text-blue-400 shrink-0" />
          <h1 className="text-[15px] font-bold text-foreground flex-1">{t("syncOfflineTelemetry", "Sync & Offline Telemetry")}</h1>
          <button
            onClick={() => metrics.reset()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("resetCounters", "Reset counters")}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-5">
        {/* Connectivity */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("connectivity", "Connectivity")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={t("network", "Network")}
              value={offline.isOnline ? t("online", "Online") : t("offline", "Offline")}
              tone={offline.isOnline ? "green" : "red"}
              icon={offline.isOnline ? CheckCircle2 : AlertTriangle}
            />
            <StatCard
              label={t("supabaseReachable", "Supabase reachable")}
              value={offline.supabaseReachable ? t("yes", "Yes") : t("no", "No")}
              tone={offline.supabaseReachable ? "green" : "amber"}
              icon={offline.supabaseReachable ? CheckCircle2 : AlertTriangle}
              hint={`Checked ${fmtAgo(offline.lastCheckedAt)}`}
            />
            <StatCard
              label={t("lastOnline", "Last online")}
              value={fmtAgo(offline.lastOnlineAt)}
              icon={Clock}
            />
            <StatCard
              label={t("sessionUptime", "Session uptime")}
              value={`${Math.floor(snap.uptimeMs / 60_000)}m`}
              icon={Clock}
            />
          </div>
        </section>

        {/* Outbox */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("outbox", "Outbox")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={t("pending", "Pending")}
              value={outbox.pending}
              icon={Clock}
              tone={outbox.pending > 0 ? "amber" : "muted"}
            />
            <StatCard
              label={t("inFlight", "In flight")}
              value={outbox.inFlight}
              icon={RefreshCw}
              tone={outbox.inFlight > 0 ? "blue" : "muted"}
            />
            <StatCard
              label={t("failedPermanent", "Failed permanent")}
              value={outbox.failedPermanent}
              icon={AlertTriangle}
              tone={outbox.failedPermanent > 0 ? "red" : "muted"}
            />
            <StatCard
              label={t("succeededHistory", "Succeeded (history)")}
              value={outbox.succeeded}
              icon={CheckCircle2}
              tone="green"
            />
          </div>
        </section>

        {/* Sync latency */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("syncLatency", "Sync latency")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={t("samples", "Samples")}
              value={snap.syncLatency.sampleCount}
              icon={Activity}
            />
            <StatCard
              label={t("avg", "Avg")}
              value={snap.syncLatency.avgMs != null ? `${snap.syncLatency.avgMs} ms` : "—"}
              icon={Activity}
            />
            <StatCard
              label={t("p50", "p50")}
              value={snap.syncLatency.p50Ms != null ? `${snap.syncLatency.p50Ms} ms` : "—"}
              icon={Activity}
            />
            <StatCard
              label={t("p95", "p95")}
              value={snap.syncLatency.p95Ms != null ? `${snap.syncLatency.p95Ms} ms` : "—"}
              icon={Activity}
              tone={
                snap.syncLatency.p95Ms != null && snap.syncLatency.p95Ms > 3000
                  ? "amber"
                  : "muted"
              }
            />
          </div>
        </section>

        {/* Counters */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("counters", "Counters")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t("enqueued", "Enqueued")} value={snap.counters.outboxEnqueued} icon={Activity} />
            <StatCard label={t("drained", "Drained")} value={snap.counters.outboxDrained} icon={CheckCircle2} tone="green" />
            <StatCard label={t("permanentFailures", "Permanent failures")} value={snap.counters.outboxFailedPermanent} icon={AlertTriangle} tone={snap.counters.outboxFailedPermanent > 0 ? "red" : "muted"} />
            <StatCard label={t("bootstrapRuns", "Bootstrap runs")} value={snap.counters.bootstrapRuns} icon={RefreshCw} />
            <StatCard label={t("syncCycles", "Sync cycles")} value={`${snap.counters.syncCyclesCompleted}/${snap.counters.syncCyclesStarted}`} icon={Activity} />
            <StatCard label={t("realtimeMessages", "Realtime messages")} value={snap.counters.realtimeMessages} icon={Activity} />
            <StatCard label={t("realtimeInvalidations", "Realtime invalidations")} value={snap.counters.realtimeInvalidations} icon={Activity} />
          </div>
        </section>

        {/* Local DB tables */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            <Database className="w-3.5 h-3.5" />
            {t("localDatabase", "Local database")}
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("table", "Table")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("rows", "Rows")}</th>
                </tr>
              </thead>
              <tbody>
                {tableCounts.map((tc) => (
                  <tr key={tc.table} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-foreground">{tc.table}</td>
                    <td className="px-4 py-2 text-right text-foreground">{tc.rowCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <HardDrive className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-foreground">
                {t("storage", "Storage")}: {fmtBytes(storage.usageBytes)} / {fmtBytes(storage.quotaBytes)}
                {storage.percent != null && (
                  <span className="text-muted-foreground"> ({storage.percent}%)</span>
                )}
              </div>
              {storage.percent != null && (
                <div className="mt-2 h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={`h-full ${storage.percent > 80 ? "bg-red-500" : storage.percent > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${storage.percent}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Bootstrap */}
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
            {t("bootstrapCache", "Bootstrap cache")}
            <button
              onClick={handleForceRefresh}
              disabled={forcing || !offline.isOnline}
              className="ml-auto flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border border-border bg-muted/30 hover:bg-muted/50 transition disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${forcing ? "animate-spin" : ""}`} />
              {t("forceFullRefresh", "Force full refresh")}
            </button>
          </h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("table", "Table")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("rows", "Rows")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("lastSynced", "Last synced")}</th>
                </tr>
              </thead>
              <tbody>
                {bootstrap.tableStatus.map((tc) => (
                  <tr key={tc.table} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-foreground">{tc.table}</td>
                    <td className="px-4 py-2 text-right text-foreground">{tc.rowCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(tc.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bootstrap.results.length > 0 && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {t("lastRun", "Last run")}: {bootstrap.status} —{" "}
              {bootstrap.results.map((r) => `${r.table}:${r.fetched}`).join("  ")}
            </div>
          )}
        </section>

        {/* Recent retries */}
        {snap.recentRetries.length > 0 && (
          <section>
            <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("recentRetries", "Recent retries")}</h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{t("when", "When")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("entity", "Entity")}</th>
                    <th className="text-right px-4 py-2 font-medium">{t("attempt", "Attempt")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("reason", "Reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snap.recentRetries].reverse().slice(0, 30).map((r, i) => (
                    <tr key={`${r.outboxId}-${i}`} className="border-t border-border">
                      <td className="px-4 py-2 text-muted-foreground">{fmtAgo(r.at)}</td>
                      <td className="px-4 py-2 font-mono text-foreground">{r.entity}</td>
                      <td className="px-4 py-2 text-right text-amber-400">{r.attempts}</td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-md">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
