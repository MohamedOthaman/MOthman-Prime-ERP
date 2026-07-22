import type { DatabaseAdapter, OutboxRecord } from "@/database/types";
import { getDeviceId } from "./deviceId";
import { recordEnqueue } from "@/telemetry/metrics";
import { classifyError, type ClassifiedError, type SyncRecordState } from "./errors";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface EnqueueInput {
  entity: string;
  op: OutboxRecord["op"];
  payload: unknown;
  id?: string;
  label?: string;
  dedupeKey?: string;
  itemCode?: string;
  entityName?: string;
  localRecordId?: string;
  remoteRecordId?: string;
  syncState?: SyncRecordState;
  initialFailure?: ClassifiedError;
  /** Legacy callers can still provide a plain first error. */
  initialError?: string;
  permanent?: boolean;
}

function failureFields(failure: ClassifiedError | undefined) {
  return {
    lastError: failure?.message ?? null,
    errorCode: failure?.code,
    errorHint: failure?.hint,
    errorDetails: failure?.details,
    retryable: failure?.retryable,
    permanent: failure?.permanent ?? false,
  };
}

async function findEquivalent(db: DatabaseAdapter, dedupeKey: string): Promise<OutboxRecord | null> {
  const rows = await db.query<OutboxRecord>("outbox", {
    filters: [{ field: "dedupeKey", equals: dedupeKey }],
    orderBy: { field: "createdAt", direction: "desc" },
  });
  return rows.find((row) => row.status !== "succeeded") ?? null;
}

export async function enqueue(db: DatabaseAdapter, input: EnqueueInput): Promise<OutboxRecord> {
  const now = Date.now();
  const failure = input.initialFailure ?? (input.initialError
    ? classifyError({ message: input.initialError, permanent: input.permanent })
    : undefined);
  const existing = input.dedupeKey ? await findEquivalent(db, input.dedupeKey) : null;
  const baseFailureAt = existing?.firstFailureAt ?? (failure ? now : undefined);

  const record: OutboxRecord = {
    id: existing?.id ?? input.id ?? generateId(),
    entity: input.entity,
    op: input.op,
    payload: input.payload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attempts: existing?.attempts ?? (failure ? 1 : 0),
    deviceId: existing?.deviceId ?? getDeviceId(),
    status: failure?.permanent ? "failed_permanent" : "pending",
    nextAttemptAt: now,
    label: input.label ?? existing?.label,
    dedupeKey: input.dedupeKey ?? existing?.dedupeKey,
    itemCode: input.itemCode ?? existing?.itemCode,
    entityName: input.entityName ?? existing?.entityName,
    localRecordId: input.localRecordId ?? failure?.localRecordId ?? existing?.localRecordId,
    remoteRecordId: input.remoteRecordId ?? failure?.remoteRecordId ?? existing?.remoteRecordId,
    syncState: input.syncState ?? failure?.syncState ?? existing?.syncState ?? "pending",
    firstFailureAt: baseFailureAt,
    lastAttemptAt: failure ? now : existing?.lastAttemptAt,
    ...failureFields(failure),
  };

  await db.put("outbox", record);
  if (!existing) recordEnqueue();
  return record;
}

export async function listPending(db: DatabaseAdapter, limit = 25): Promise<OutboxRecord[]> {
  const now = Date.now();
  const rows = await db.query<OutboxRecord>("outbox", {
    filters: [{ field: "status", equals: "pending" }],
    orderBy: { field: "createdAt", direction: "asc" },
  });
  return rows.filter((row) => (row.nextAttemptAt ?? 0) <= now).slice(0, limit);
}

export async function listAll(db: DatabaseAdapter): Promise<OutboxRecord[]> {
  return db.query<OutboxRecord>("outbox", {
    orderBy: { field: "createdAt", direction: "desc" },
  });
}

export async function markInFlight(db: DatabaseAdapter, id: string): Promise<OutboxRecord | null> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return null;
  const next: OutboxRecord = {
    ...existing,
    status: "in_flight",
    attempts: (existing.attempts ?? 0) + 1,
    lastAttemptAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put("outbox", next);
  return next;
}

export async function markSuccess(db: DatabaseAdapter, id: string): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: "succeeded",
    lastError: null,
    errorCode: undefined,
    errorHint: undefined,
    errorDetails: undefined,
    retryable: false,
    permanent: false,
    syncState: "remote",
    updatedAt: Date.now(),
  });
}

export async function updateOutboxMetadata(
  db: DatabaseAdapter,
  id: string,
  patch: Pick<OutboxRecord, "remoteRecordId" | "syncState">
): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  });
}

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;

export function nextDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts), MAX_DELAY_MS);
}

export async function markFailed(
  db: DatabaseAdapter,
  id: string,
  error: unknown
): Promise<OutboxRecord | null> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return null;
  const classified = classifyError(error);
  const attempts = existing.attempts ?? 0;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const parked = classified.permanent || exhausted;
  const now = Date.now();
  const next: OutboxRecord = {
    ...existing,
    status: parked ? "failed_permanent" : "pending",
    lastError: classified.message,
    errorCode: classified.code,
    errorHint: classified.hint,
    errorDetails: classified.details,
    retryable: classified.retryable && !exhausted,
    permanent: classified.permanent,
    firstFailureAt: existing.firstFailureAt ?? now,
    localRecordId: classified.localRecordId ?? existing.localRecordId,
    remoteRecordId: classified.remoteRecordId ?? existing.remoteRecordId,
    syncState: classified.syncState ?? existing.syncState ?? "unknown",
    nextAttemptAt: parked ? now : now + nextDelayMs(attempts),
    updatedAt: now,
  };
  await db.put("outbox", next);
  return next;
}

/** Recover work that was interrupted by a tab/app shutdown. */
export async function recoverInterrupted(db: DatabaseAdapter): Promise<number> {
  const interrupted = await db.query<OutboxRecord>("outbox", {
    filters: [{ field: "status", equals: "in_flight" }],
  });
  const now = Date.now();
  for (const row of interrupted) {
    await db.put<OutboxRecord>("outbox", {
      ...row,
      status: "pending",
      retryable: true,
      permanent: false,
      errorCode: "INTERRUPTED_RESTART",
      errorHint: "The previous attempt was interrupted when the app closed; it is safe to replay.",
      nextAttemptAt: now,
      updatedAt: now,
    });
  }
  return interrupted.length;
}

export async function discard(db: DatabaseAdapter, id: string): Promise<void> {
  await db.delete("outbox", id);
}

export async function retryNow(db: DatabaseAdapter, id: string): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: "pending",
    nextAttemptAt: Date.now(),
    retryable: true,
    updatedAt: Date.now(),
  });
}

export async function countByStatus(
  db: DatabaseAdapter,
  status: OutboxRecord["status"]
): Promise<number> {
  return db.count("outbox", { filters: [{ field: "status", equals: status }] });
}
