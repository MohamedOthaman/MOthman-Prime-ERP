import type { OutboxRecord } from "@/database/types";

export interface SyncHandlerResult {
  remoteRecordId?: string;
  syncState?: OutboxRecord["syncState"];
}

export type SyncHandler = (record: OutboxRecord) => Promise<SyncHandlerResult | void>;

/**
 * Registry mapping `entity:op` → handler that fires the actual remote call.
 * Handlers must be idempotent (server-side should accept replays).
 */
const registry = new Map<string, SyncHandler>();

function keyFor(entity: string, op: OutboxRecord["op"]): string {
  return `${entity}:${op}`;
}

export function registerHandler(
  entity: string,
  op: OutboxRecord["op"],
  handler: SyncHandler
): void {
  registry.set(keyFor(entity, op), handler);
}

export function getHandler(record: OutboxRecord): SyncHandler | undefined {
  return registry.get(keyFor(record.entity, record.op));
}

export function listRegisteredEntities(): string[] {
  return Array.from(registry.keys());
}
