import type { DatabaseAdapter } from "@/database/types";
import {
  listPending,
  markFailed,
  markInFlight,
  markSuccess,
  recoverInterrupted,
  updateOutboxMetadata,
} from "./outbox";
import { getHandler } from "./handlers";
import { SyncOperationError } from "./errors";
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
          const attempt = await markInFlight(db, entry.id);
          if (!attempt) continue;
          const handler = getHandler(attempt);
          if (!handler) {
            await markFailed(
              db,
              attempt.id,
              new SyncOperationError(
                `No sync handler is registered for ${attempt.entity}:${attempt.op}`,
                {
                  code: "NO_SYNC_HANDLER",
                  permanent: true,
                  retryable: false,
                  syncState: attempt.syncState ?? "local_only",
                }
              )
            );
            continue;
          }

          const startedAt = Date.now();
          try {
            if (isDryRun()) {
              console.info("[sync:dry-run]", attempt.entity, attempt.op, attempt.id);
            } else {
              const result = (await handler(attempt)) as
                | import("./handlers").SyncHandlerResult
                | undefined;
              if (result?.remoteRecordId || result?.syncState) {
                await updateOutboxMetadata(db, attempt.id, {
                  remoteRecordId: result.remoteRecordId ?? attempt.remoteRecordId,
                  syncState: result.syncState ?? attempt.syncState,
                });
              }
            }
            await markSuccess(db, attempt.id);
            recordSyncLatency({
              entity: attempt.entity,
              op: attempt.op,
              durationMs: Date.now() - startedAt,
              attempts: attempt.attempts,
              outcome: "success",
            });
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const failed = await markFailed(db, attempt.id, err);
            const willRetry = failed?.status === "pending";
            recordSyncLatency({
              entity: attempt.entity,
              op: attempt.op,
              durationMs: Date.now() - startedAt,
              attempts: attempt.attempts,
              outcome: willRetry ? "retry" : "failed_permanent",
              error: error.message,
            });
            if (willRetry && failed) {
              recordRetry({
                entity: attempt.entity,
                outboxId: attempt.id,
                attempts: attempt.attempts,
                reason: error.message,
                nextAttemptInMs: Math.max(0, failed.nextAttemptAt - Date.now()),
              });
            }
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
      void recoverInterrupted(db).then(() => drain());
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
