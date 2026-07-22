import { describe, expect, it, vi } from "vitest";
import type { OutboxRecord } from "@/database/types";
import { registerHandler } from "@/sync/handlers";
import { enqueue, retryNow } from "@/sync/outbox";
import { createSyncWorker } from "@/sync/worker";
import { TestDatabase } from "./testDatabase";

describe("sync worker retry behavior", () => {
  it("backs off a transient failure and succeeds after an explicit safe retry", async () => {
    const db = new TestDatabase();
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce({ remoteRecordId: "remote-1", syncState: "remote" });
    registerHandler("worker_transient", "create", handler);
    const row = await enqueue(db, {
      entity: "worker_transient",
      op: "create",
      payload: {},
      syncState: "local_only",
    });
    const worker = createSyncWorker(db, { isOnline: () => true });

    await worker.drain();
    await worker.drain();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await db.get<OutboxRecord>("outbox", row.id))?.status).toBe("pending");

    await retryNow(db, row.id);
    await worker.drain();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(await db.get<OutboxRecord>("outbox", row.id)).toMatchObject({
      status: "succeeded",
      remoteRecordId: "remote-1",
      syncState: "remote",
    });
  });

  it("parks a permanent failure without an automatic retry loop", async () => {
    const db = new TestDatabase();
    const handler = vi.fn().mockRejectedValue({ code: "42501", message: "RLS denied" });
    registerHandler("worker_permanent", "create", handler);
    const row = await enqueue(db, {
      entity: "worker_permanent",
      op: "create",
      payload: {},
    });
    const worker = createSyncWorker(db, { isOnline: () => true });

    await worker.drain();
    await worker.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(await db.get<OutboxRecord>("outbox", row.id)).toMatchObject({
      status: "failed_permanent",
      permanent: true,
      retryable: false,
      errorCode: "42501",
    });
  });
});
