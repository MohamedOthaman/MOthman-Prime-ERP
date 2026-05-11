import type { DatabaseAdapter, OutboxRecord } from "@/database/types";
import { getDeviceId } from "./deviceId";

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
  /** Use a known id (e.g. matching a sales_headers row) for idempotent replays. */
  id?: string;
}

export async function enqueue(
  db: DatabaseAdapter,
  input: EnqueueInput
): Promise<OutboxRecord> {
  const now = Date.now();
  const record: OutboxRecord = {
    id: input.id ?? generateId(),
    entity: input.entity,
    op: input.op,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: null,
    deviceId: getDeviceId(),
    status: "pending",
    nextAttemptAt: now,
  };
  await db.put("outbox", record);
  return record;
}

export async function listPending(
  db: DatabaseAdapter,
  limit = 25
): Promise<OutboxRecord[]> {
  const now = Date.now();
  const rows = (await db.query<OutboxRecord>("outbox", {
    filters: [{ field: "status", equals: "pending" }],
    orderBy: { field: "createdAt", direction: "asc" },
    limit,
  })) as OutboxRecord[];
  return rows.filter((r) => r.nextAttemptAt <= now);
}

export async function listAll(db: DatabaseAdapter): Promise<OutboxRecord[]> {
  return (await db.query<OutboxRecord>("outbox", {
    orderBy: { field: "createdAt", direction: "desc" },
  })) as OutboxRecord[];
}

export async function markInFlight(
  db: DatabaseAdapter,
  id: string
): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: "in_flight",
    updatedAt: Date.now(),
  });
}

export async function markSuccess(
  db: DatabaseAdapter,
  id: string
): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: "succeeded",
    lastError: null,
    updatedAt: Date.now(),
  });
}

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;

export function nextDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
}

export async function markFailed(
  db: DatabaseAdapter,
  id: string,
  error: Error
): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  const attempts = existing.attempts + 1;
  const isPermanent = attempts >= MAX_ATTEMPTS;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: isPermanent ? "failed_permanent" : "pending",
    attempts,
    lastError: error.message,
    nextAttemptAt: Date.now() + nextDelayMs(attempts),
    updatedAt: Date.now(),
  });
}

export async function discard(db: DatabaseAdapter, id: string): Promise<void> {
  await db.delete("outbox", id);
}

export async function retryNow(
  db: DatabaseAdapter,
  id: string
): Promise<void> {
  const existing = await db.get<OutboxRecord>("outbox", id);
  if (!existing) return;
  await db.put<OutboxRecord>("outbox", {
    ...existing,
    status: "pending",
    nextAttemptAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function countByStatus(
  db: DatabaseAdapter,
  status: OutboxRecord["status"]
): Promise<number> {
  return db.count("outbox", {
    filters: [{ field: "status", equals: status }],
  });
}