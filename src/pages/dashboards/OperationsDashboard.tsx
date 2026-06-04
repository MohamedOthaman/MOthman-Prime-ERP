import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  RefreshCw,
  ServerCog,
  Workflow,
  Wifi,
  WifiOff,
  Database,
  FileScan,
  Cpu,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/contexts/LanguageContext";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { useNetworkStatus } from "@/offline/useNetworkStatus";
import { useAutomationRules, useAutomationRuns } from "@/lib/automation/hooks";
import type { RunStatus } from "@/lib/automation/types";
import {
  DashboardShell,
  KpiGrid,
  SectionCard,
  PipelineBar,
  FeedRow,
  EmptyState,
  LoadingRows,
  AlertBanner,
  AlertGroup,
  type KpiItem,
  type PipelineRow,
} from "@/components/dashboard/DashboardShell";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape of GET /health from the extraction service (services/extraction-service/main.py). */
interface ExtractionHealth {
  status: string;
  version: string;
  ocr_provider: string;
  pdfplumber: boolean;
  pdf2image: boolean;
  pytesseract: boolean;
  paddleocr: boolean;
  structure_provider: string;
  gemini_api_key_set: boolean;
  minicpm_v_enabled: boolean;
  minicpm_v_available: boolean | null;
  ultralytics_enabled: boolean;
  ultralytics_available: boolean | null;
  pandas: boolean;
  numpy: boolean;
  pillow: boolean;
}

interface OcrStats {
  total: number;
  last24h: number;
  byStatus: Record<string, number>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const EXTRACTION_URL =
  (import.meta.env.VITE_EXTRACTION_SERVICE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";
const HEALTH_POLL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

// ─── Status colour maps ──────────────────────────────────────────────────────

const OCR_STATUS_COLOR: Record<string, { bar: string; text: string }> = {
  extracted: { bar: "bg-emerald-500", text: "text-emerald-400" },
  posted: { bar: "bg-blue-500", text: "text-blue-400" },
  done: { bar: "bg-blue-500", text: "text-blue-400" },
  processing: { bar: "bg-amber-500", text: "text-amber-400" },
  pending: { bar: "bg-amber-500", text: "text-amber-400" },
  needs_review: { bar: "bg-amber-500", text: "text-amber-400" },
  failed: { bar: "bg-rose-500", text: "text-rose-400" },
  error: { bar: "bg-rose-500", text: "text-rose-400" },
};
const ocrColor = (s: string) =>
  OCR_STATUS_COLOR[s] ?? { bar: "bg-slate-500", text: "text-slate-400" };

const runDot = (s: RunStatus): string =>
  s === "success"
    ? "bg-emerald-400"
    : s === "failed"
      ? "bg-rose-400"
      : s === "running"
        ? "bg-blue-400"
        : s === "skipped"
          ? "bg-muted-foreground/40"
          : "bg-amber-400";

const dotFor = (ok: boolean | null) =>
  ok === null ? "bg-muted-foreground/40" : ok ? "bg-emerald-400" : "bg-rose-400";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Data hook ───────────────────────────────────────────────────────────────
// Combines remote (extraction /health, ocr_documents) and client-local
// (sync queue, network, automation) monitoring sources. All fetches degrade
// gracefully — a panel shows an "unreachable"/empty state rather than crashing.

function useOperationsData() {
  const [health, setHealth] = useState<ExtractionHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);
  const [ocr, setOcr] = useState<OcrStats | null>(null);
  const [ocrLoading, setOcrLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${EXTRACTION_URL}/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ExtractionHealth;
      setHealth(json);
      setHealthError(false);
    } catch {
      setHealth(null);
      setHealthError(true);
    } finally {
      clearTimeout(timer);
      setHealthLoading(false);
    }
  }, []);

  const fetchOcr = useCallback(async () => {
    setOcrLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ocr_documents" as never)
        .select("status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows =
        (data as unknown as Array<{ status: string | null; created_at: string | null }>) ?? [];
      const byStatus: Record<string, number> = {};
      let last24h = 0;
      for (const r of rows) {
        const s = r.status ?? "unknown";
        byStatus[s] = (byStatus[s] ?? 0) + 1;
        if (r.created_at && r.created_at >= since) last24h++;
      }
      setOcr({ total: rows.length, last24h, byStatus });
    } catch {
      setOcr(null);
    } finally {
      setOcrLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchHealth();
    void fetchOcr();
  }, [fetchHealth, fetchOcr]);

  // Poll /health on an interval; one-shot the OCR stats.
  useEffect(() => {
    void fetchHealth();
    const id = window.setInterval(() => void fetchHealth(), HEALTH_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchHealth]);

  useEffect(() => {
    void fetchOcr();
  }, [fetchOcr]);

  return { health, healthLoading, healthError, ocr, ocrLoading, refresh };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OperationsDashboard() {
  const { t } = useLang();
  const { health, healthLoading, healthError, ocr, ocrLoading, refresh } = useOperationsData();
  const sync = useSyncStatus();
  const net = useNetworkStatus();
  const { rules, loading: rulesLoading } = useAutomationRules();
  const { runs, loading: runsLoading, refresh: refreshRuns } = useAutomationRuns(20);

  const handleRefresh = useCallback(() => {
    refresh();
    refreshRuns();
  }, [refresh, refreshRuns]);

  const stateText = (ok: boolean | null): string =>
    ok === null ? t("opsDisabled", "disabled") : ok ? t("opsUp", "up") : t("opsDown", "down");

  // ── KPI cards ──────────────────────────────────────────────────────────────
  const kpis: KpiItem[] = [
    {
      label: t("opsExtraction", "Extraction Service"),
      value: healthLoading
        ? "…"
        : healthError
          ? t("opsUnreachable", "Unreachable")
          : t("opsHealthy", "Healthy"),
      sub: health ? `${health.ocr_provider} · ${health.structure_provider}` : EXTRACTION_URL,
      icon: ServerCog,
      color: healthError ? "text-rose-400" : "text-emerald-400",
      bg: healthError ? "bg-rose-500/10" : "bg-emerald-500/10",
      border: healthError ? "border-rose-500/20" : "border-emerald-500/20",
      loading: healthLoading,
    },
    {
      label: t("opsSyncQueue", "Sync Queue"),
      value: sync.pending + sync.inFlight,
      sub:
        sync.failedPermanent > 0
          ? `${sync.failedPermanent} ${t("opsFailed", "failed")}`
          : t("opsAllClear", "all clear"),
      icon: Database,
      color: sync.failedPermanent > 0 ? "text-rose-400" : "text-amber-400",
      bg: sync.failedPermanent > 0 ? "bg-rose-500/10" : "bg-amber-500/10",
      border: sync.failedPermanent > 0 ? "border-rose-500/20" : "border-amber-500/20",
    },
    {
      label: t("opsAutomation", "Automation"),
      value: rulesLoading ? "…" : rules.length,
      sub: `${runs.length} ${t("opsRuns", "runs")}`,
      icon: Workflow,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      loading: rulesLoading,
    },
    {
      label: t("opsNetwork", "Network"),
      value: net.isOnline ? t("opsOnline", "Online") : t("opsOffline", "Offline"),
      sub: net.supabaseReachable
        ? t("opsSupabaseOk", "Supabase reachable")
        : t("opsSupabaseDown", "Supabase down"),
      icon: net.isOnline ? Wifi : WifiOff,
      color: net.isOnline ? "text-emerald-400" : "text-rose-400",
      bg: net.isOnline ? "bg-emerald-500/10" : "bg-rose-500/10",
      border: net.isOnline ? "border-emerald-500/20" : "border-rose-500/20",
    },
  ];

  // ── OCR pipeline rows ────────────────────────────────────────────────────────
  const ocrRows: PipelineRow[] = ocr
    ? Object.entries(ocr.byStatus)
        .sort(([, a], [, b]) => b - a)
        .map(([status, count]) => ({
          label: status.replace(/_/g, " "),
          count,
          ...ocrColor(status),
        }))
    : [];

  // ── Provider rows ────────────────────────────────────────────────────────────
  const providerRows: Array<{ label: string; ok: boolean | null; detail: string }> = health
    ? [
        { label: "PaddleOCR", ok: health.paddleocr, detail: stateText(health.paddleocr) },
        { label: "Tesseract", ok: health.pytesseract, detail: stateText(health.pytesseract) },
        { label: "pdfplumber", ok: health.pdfplumber, detail: stateText(health.pdfplumber) },
        { label: "pdf2image", ok: health.pdf2image, detail: stateText(health.pdf2image) },
        {
          label: t("opsGeminiKey", "Gemini API key"),
          ok: health.gemini_api_key_set,
          detail: health.gemini_api_key_set
            ? t("opsConfigured", "configured")
            : t("opsMissing", "missing"),
        },
        {
          label: "MiniCPM-V",
          ok: health.minicpm_v_enabled ? health.minicpm_v_available : null,
          detail: health.minicpm_v_enabled
            ? stateText(health.minicpm_v_available)
            : t("opsDisabled", "disabled"),
        },
        {
          label: "Ultralytics",
          ok: health.ultralytics_enabled ? health.ultralytics_available : null,
          detail: health.ultralytics_enabled
            ? stateText(health.ultralytics_available)
            : t("opsDisabled", "disabled"),
        },
        {
          label: "pandas / numpy / pillow",
          ok: health.pandas && health.numpy && health.pillow,
          detail: `${[health.pandas, health.numpy, health.pillow].filter(Boolean).length}/3`,
        },
      ]
    : [];

  const hasAlerts = healthError || sync.failedPermanent > 0 || !net.supabaseReachable;

  return (
    <DashboardShell
      icon={Activity}
      title={t("opsTitle", "Operations Dashboard")}
      subtitle={t("opsSubtitle", "System health & deployment monitoring")}
      accent="violet"
      headerAction={
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs bg-muted text-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-80 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("opsRefresh", "Refresh")}
        </button>
      }
    >
      {/* ── Alerts ─────────────────────────────────────────────── */}
      <AlertGroup show={hasAlerts}>
        {healthError && (
          <AlertBanner
            severity="warning"
            message={t(
              "opsAlertExtraction",
              "Extraction service is unreachable — OCR extraction will fail.",
            )}
          />
        )}
        {sync.failedPermanent > 0 && (
          <AlertBanner
            severity="danger"
            message={`${sync.failedPermanent} ${t(
              "opsAlertSync",
              "sync operation(s) failed permanently and need attention.",
            )}`}
          />
        )}
        {!net.supabaseReachable && (
          <AlertBanner
            severity="warning"
            message={t("opsAlertSupabase", "Supabase is not reachable — running in offline mode.")}
          />
        )}
      </AlertGroup>

      {/* ── KPIs ───────────────────────────────────────────────── */}
      <KpiGrid items={kpis} />

      {/* ── OCR pipeline + Automation runs ─────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard
          title={t("opsOcrPipeline", "OCR Pipeline")}
          icon={FileScan}
          iconClass="text-cyan-400"
          action={
            ocr && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {ocr.last24h} {t("opsLast24h", "last 24h")}
              </span>
            )
          }
        >
          {ocrLoading ? (
            <LoadingRows count={3} />
          ) : !ocr || ocr.total === 0 ? (
            <EmptyState icon={FileScan} message={t("opsNoOcr", "No OCR documents yet")} />
          ) : (
            <PipelineBar rows={ocrRows} total={ocr.total} labelWidth="w-24" />
          )}
        </SectionCard>

        <SectionCard
          title={t("opsAutomationRuns", "Automation Runs")}
          icon={Workflow}
          iconClass="text-violet-400"
          action={
            !runsLoading && (
              <span className="text-[10px] font-mono text-muted-foreground">{runs.length}</span>
            )
          }
        >
          {runsLoading ? (
            <LoadingRows count={3} />
          ) : runs.length === 0 ? (
            <EmptyState icon={Workflow} message={t("opsNoRuns", "No automation runs recorded")} />
          ) : (
            <div className="space-y-1.5">
              {runs.slice(0, 8).map((run) => (
                <FeedRow
                  key={run.id}
                  dot={runDot(run.status)}
                  middle={
                    <>
                      <p className="text-xs text-foreground truncate">{run.ruleName}</p>
                      <p className="text-[10px] text-muted-foreground">{run.trigger}</p>
                    </>
                  }
                  right={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] font-medium capitalize text-muted-foreground">
                        {run.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {formatTime(run.startedAt)}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Extraction providers (full width) ──────────────────── */}
      <SectionCard
        title={t("opsProviders", "Extraction Providers")}
        icon={Cpu}
        iconClass="text-sky-400"
        action={
          health && (
            <span className="text-[10px] font-mono text-muted-foreground">v{health.version}</span>
          )
        }
      >
        {healthLoading ? (
          <LoadingRows count={4} />
        ) : healthError || !health ? (
          <EmptyState
            icon={ServerCog}
            message={t("opsProvidersDown", "Cannot reach extraction service")}
            sub={EXTRACTION_URL}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-1.5">
            {providerRows.map((p) => (
              <FeedRow
                key={p.label}
                dot={dotFor(p.ok)}
                middle={<p className="text-xs text-foreground">{p.label}</p>}
                right={<span className="text-[10px] text-muted-foreground">{p.detail}</span>}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Sync & network detail ──────────────────────────────── */}
      <SectionCard
        title={t("opsSyncNetwork", "Sync & Network")}
        icon={Database}
        iconClass="text-emerald-400"
      >
        <div className="grid sm:grid-cols-2 gap-1.5">
          <FeedRow
            dot={sync.pending > 0 ? "bg-amber-400" : "bg-muted-foreground/30"}
            middle={<p className="text-xs text-foreground">{t("opsPending", "Pending")}</p>}
            right={<span className="text-xs font-mono text-foreground">{sync.pending}</span>}
          />
          <FeedRow
            dot={sync.inFlight > 0 ? "bg-blue-400" : "bg-muted-foreground/30"}
            middle={<p className="text-xs text-foreground">{t("opsInFlight", "In flight")}</p>}
            right={<span className="text-xs font-mono text-foreground">{sync.inFlight}</span>}
          />
          <FeedRow
            dot={sync.failedPermanent > 0 ? "bg-rose-400" : "bg-muted-foreground/30"}
            middle={<p className="text-xs text-foreground">{t("opsFailedPermanent", "Failed")}</p>}
            right={<span className="text-xs font-mono text-foreground">{sync.failedPermanent}</span>}
          />
          <FeedRow
            dot={net.supabaseReachable ? "bg-emerald-400" : "bg-rose-400"}
            middle={<p className="text-xs text-foreground">{t("opsSupabase", "Supabase")}</p>}
            right={
              <span className="text-[10px] text-muted-foreground">
                {net.supabaseReachable
                  ? t("opsReachable", "reachable")
                  : t("opsNotReachable", "down")}
              </span>
            }
          />
        </div>
      </SectionCard>
    </DashboardShell>
  );
}
