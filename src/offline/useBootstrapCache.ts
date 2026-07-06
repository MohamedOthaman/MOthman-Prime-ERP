import { useEffect, useRef, useState } from "react";
import { useDatabase } from "@/database/DatabaseProvider";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { bootstrapAll, getBootstrapStatus, type BootstrapResult } from "./bootstrapCache";
import { seedFromBundleIfEmpty } from "./bundleSeed";
import { recordBootstrap } from "@/telemetry/metrics";

const REFRESH_INTERVAL_MS = 15 * 60_000; // 15 min throttle on auto-refresh

export interface BootstrapState {
  status: "idle" | "running" | "succeeded" | "failed";
  lastRunAt: number | null;
  results: BootstrapResult[];
  tableStatus: Array<{ table: string; lastSyncedAt: number | null; rowCount: number }>;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
}

export function useBootstrapCache(options?: { enabled?: boolean }): BootstrapState {
  const db = useDatabase();
  const { isOnline, supabaseReachable } = useOfflineStatus();
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<Omit<BootstrapState, "refresh">>({
    status: "idle",
    lastRunAt: null,
    results: [],
    tableStatus: [],
  });
  const runningRef = useRef(false);

  const run = async (opts?: { force?: boolean }) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState((p) => ({ ...p, status: "running" }));
    try {
      const results = await bootstrapAll(db, opts);
      const tableStatus = await getBootstrapStatus(db);
      const anyFailed = results.some((r) => r.error);
      setState({
        status: anyFailed ? "failed" : "succeeded",
        lastRunAt: Date.now(),
        results,
        tableStatus,
      });
      for (const r of results) recordBootstrap(r);
    } catch (err) {
      setState((p) => ({
        ...p,
        status: "failed",
        lastRunAt: Date.now(),
      }));
       
      console.warn("[bootstrap] failed", err);
    } finally {
      runningRef.current = false;
    }
  };

  // First-launch seed from the bundled master data — runs regardless of
  // connectivity so a fresh offline install still has its business brain.
  useEffect(() => {
    if (!enabled) return;
    void seedFromBundleIfEmpty(db).then((result) => {
      if (result.status === "seeded") {
        console.info("[bundle-seed] seeded local master data", result.seeded);
        void getBootstrapStatus(db).then((tableStatus) =>
          setState((p) => ({ ...p, tableStatus }))
        );
      }
    });

  }, [enabled, db]);

  useEffect(() => {
    if (!enabled) return;
    if (!isOnline || !supabaseReachable) return;

    // Cold-load status from disk
    void getBootstrapStatus(db).then((tableStatus) => {
      setState((p) => ({ ...p, tableStatus }));

      const oldestSync = tableStatus.reduce(
        (min, t) => (t.lastSyncedAt && (!min || t.lastSyncedAt < min) ? t.lastSyncedAt : min),
        null as number | null
      );

      const needsRefresh =
        tableStatus.some((t) => t.rowCount === 0) ||
        (oldestSync != null && Date.now() - oldestSync > REFRESH_INTERVAL_MS);

      if (needsRefresh) void run();
    });
     
  }, [enabled, isOnline, supabaseReachable]);

  return { ...state, refresh: run };
}
