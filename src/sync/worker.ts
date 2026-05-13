import type { DatabaseAdapter } from "@/database/types";
import {
  listPending,
  markFailed,
  markInFlight,
  markSuccess,
} from "./outbox";
import { getHandler } from "./handlers";
import {
  recordSyncCycleComplete,
  recordSyncCycleStart,
  recordSyncLatency,
  recordRetry,
} from "@/telemetry/metrics";

const DISABLED_KEY = "food-choice-erp.sync.disabled";
const DRY_RUN_KEY = "food-choice-erp.sync.dryrun";
const HEARTBEAT_MS = 30_000;

function isDisabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DISABLED_KEY) === "1";
}

function isDryRun(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DRY_RUN_KEY) === "1";
}

export interface SyncWorkerOptions {
  /** Returns whether we currently believe the network is usable. */
  isOnline: () => boolean;
  /** Called after each successful drain pass to update UI state. */
  onTick?: () => void;
}

export interface SyncWorker {
  start(): void;
  stop(): void;
  /** Immediately drain pending entries (no-op if disabled or offline). */
  drain(): Promise<void>;
}

export function createSyncWorker(
  db: DatabaseAdapter,
  options: SyncWorkerOptions
): SyncWorker {
  let timerId: number | null = null;
  let draining = false;

  const drain = async (): Promise<void> => {
    if (draining) return;
    if (isDisabled() || !options.isOnline()) return;
    draining = true;
    recordSyncCycleStart();
    try {
      // Keep going while there's still work — but cap to avoid hot loops.
      for (let pass = 0; pass < 5; pass++) {
        const pending = await listPending(db, 25);
        if (pending.length === 0) break;

        for (const entry of pending) {
          if (isDisabled() || !options.isOnline()) return;
          const handler = getHandler(entry);
          if (!handler) {
            await markFailed(
              db,
              entry.id,
              new Error(`No handler registered for ${entry.entity}:${entry.op}`)
            );
            continue;
          }

          await markInFlight(db, entry.id);
          const startedAt = Date.now();
          try {
            if (isDryRun()) {
              // eslint-disable-next-line no-console
              console.info("[sync:dry-run]", entry.entity, entry.op, entry.id);
            } else {
              await handler(entry);
            }
            await markSuccess(db, entry.id);
            recordSyncLatency({
              entity: entry.entity,
              op: entry.op,
              durationMs: Date.now() - startedAt,
              attempts: entry.attempts + 1,
              outcome: "success",
            });
          } catch (err) {
            const error = err as Error;
            await markFailed(db, entry.id, error);
            recordSyncLatency({
              entity: entry.entity,
              op: entry.op,
              durationMs: Date.now() - startedAt,
              attempts: entry.attempts + 1,
              outcome: "retry",
              error: error.message,
            });
            recordRetry({
              entity: entry.entity,
              outboxId: entry.id,
              attempts: entry.attempts + 1,
              reason: error.message,
              nextAttemptInMs: 0,
            });
          }
        }
      }
    } finally {
      draining = false;
      recordSyncCycleComplete();
      options.onTick?.();
    }
  };

  const handleOnline = () => {
    void drain();
  };

  return {
    start() {
      if (timerId !== null) return;
      if (typeof window !== "undefined") {
        window.addEventListener("online", handleOnline);
      }
      timerId = window.setInterval(drain, HEARTBEAT_MS);
      void drain();
    },
    stop() {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    },
    drain,
  };
}