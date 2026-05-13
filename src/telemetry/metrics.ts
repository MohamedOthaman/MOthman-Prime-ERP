/**
 * Lightweight in-memory metrics sink for sync + offline behaviour.
 *
 * - Zero external deps (no Sentry, no Prom)
 * - Exposed via the AdminTelemetryPage and the dev console (`window.__erp_metrics`)
 * - Bounded ring buffers prevent unbounded memory growth on long sessions
 */

import type { BootstrapResult } from "@/offline/bootstrapCache";

const RING_SIZE = 200;

class Ring<T> {
  private buf: T[] = [];
  push(item: T) {
    this.buf.push(item);
    if (this.buf.length > RING_SIZE) this.buf.splice(0, this.buf.length - RING_SIZE);
  }
  all(): T[] {
    return this.buf.slice();
  }
  clear() {
    this.buf = [];
  }
}

export interface SyncLatencyEvent {
  at: number;
  entity: string;
  op: string;
  durationMs: number;
  attempts: number;
  outcome: "success" | "retry" | "failed_permanent";
  error?: string;
}

export interface RetryEvent {
  at: number;
  entity: string;
  outboxId: string;
  attempts: number;
  reason: string;
  nextAttemptInMs: number;
}

export interface BootstrapEvent {
  at: number;
  table: string;
  fetched: number;
  durationMs: number;
  mode: BootstrapResult["mode"];
  error?: string;
}

interface MetricCounters {
  outboxEnqueued: number;
  outboxDrained: number;
  outboxFailedPermanent: number;
  realtimeInvalidations: number;
  realtimeMessages: number;
  bootstrapRuns: number;
  syncCyclesStarted: number;
  syncCyclesCompleted: number;
}

const sessionStart = Date.now();

const counters: MetricCounters = {
  outboxEnqueued: 0,
  outboxDrained: 0,
  outboxFailedPermanent: 0,
  realtimeInvalidations: 0,
  realtimeMessages: 0,
  bootstrapRuns: 0,
  syncCyclesStarted: 0,
  syncCyclesCompleted: 0,
};

const syncLatencies = new Ring<SyncLatencyEvent>();
const retryEvents = new Ring<RetryEvent>();
const bootstrapEvents = new Ring<BootstrapEvent>();

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}

export const metrics = {
  recordSyncLatency(e: Omit<SyncLatencyEvent, "at">) {
    syncLatencies.push({ ...e, at: Date.now() });
    if (e.outcome === "success") counters.outboxDrained += 1;
    if (e.outcome === "failed_permanent") counters.outboxFailedPermanent += 1;
    notify();
  },
  recordRetry(e: Omit<RetryEvent, "at">) {
    retryEvents.push({ ...e, at: Date.now() });
    notify();
  },
  recordBootstrap(r: BootstrapResult) {
    bootstrapEvents.push({
      at: Date.now(),
      table: r.table,
      fetched: r.fetched,
      durationMs: r.durationMs,
      mode: r.mode,
      error: r.error,
    });
    counters.bootstrapRuns += 1;
    notify();
  },
  recordEnqueue() {
    counters.outboxEnqueued += 1;
    notify();
  },
  recordSyncCycleStart() {
    counters.syncCyclesStarted += 1;
    notify();
  },
  recordSyncCycleComplete() {
    counters.syncCyclesCompleted += 1;
    notify();
  },
  recordRealtimeMessage() {
    counters.realtimeMessages += 1;
    notify();
  },
  recordRealtimeInvalidation() {
    counters.realtimeInvalidations += 1;
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot() {
    const lat = syncLatencies.all();
    const successDurations = lat.filter((e) => e.outcome === "success").map((e) => e.durationMs);
    const sorted = [...successDurations].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;

    return {
      sessionStart,
      uptimeMs: Date.now() - sessionStart,
      counters: { ...counters },
      syncLatency: {
        sampleCount: successDurations.length,
        p50Ms: pct(0.5),
        p95Ms: pct(0.95),
        avgMs: successDurations.length
          ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length)
          : null,
      },
      recentLatency: lat,
      recentRetries: retryEvents.all(),
      recentBootstraps: bootstrapEvents.all(),
    };
  },
  reset() {
    Object.keys(counters).forEach((k) => ((counters as any)[k] = 0));
    syncLatencies.clear();
    retryEvents.clear();
    bootstrapEvents.clear();
    notify();
  },
};

// Bound helpers exposed for convenient call-sites
export const recordSyncLatency = metrics.recordSyncLatency.bind(metrics);
export const recordRetry = metrics.recordRetry.bind(metrics);
export const recordBootstrap = metrics.recordBootstrap.bind(metrics);
export const recordEnqueue = metrics.recordEnqueue.bind(metrics);
export const recordSyncCycleStart = metrics.recordSyncCycleStart.bind(metrics);
export const recordSyncCycleComplete = metrics.recordSyncCycleComplete.bind(metrics);
export const recordRealtimeMessage = metrics.recordRealtimeMessage.bind(metrics);
export const recordRealtimeInvalidation = metrics.recordRealtimeInvalidation.bind(metrics);

if (typeof window !== "undefined") {
  (window as any).__erp_metrics = metrics;
}
