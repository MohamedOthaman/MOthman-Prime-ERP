import { describe, expect, it } from "vitest";
import type { OutboxRecord } from "@/database/types";
import {
  enqueue,
  markFailed,
  markInFlight,
  recoverInterrupted,
  retryNow,
} from "@/sync/outbox";
import { classifyError } from "@/sync/errors";
import { TestDatabase } from "./testDatabase";

describe("outbox durability and retry policy", () => {
  it("parks a permanent first failure with structured diagnostics", async () => {
    const db = new TestDatabase();
    const failure = classifyError({ code: "42501", message: "RLS rejected product" });
    const row = await enqueue(db, {
      entity: "product_master",
      op: "create",
      payload: { value: 1 },
      dedupeKey: "product_master:ABC",
      itemCode: "ABC",
      localRecordId: "local:product:ABC",
      syncState: "local_only",
      initialFailure: failure,
    });

    expect(row.status).toBe("failed_permanent");
    expect(row.errorCode).toBe("42501");
    expect(row.retryable).toBe(false);
    expect(row.attempts).toBe(1);
    expect(row.firstFailureAt).toBeTypeOf("number");
  });

  it("replaces equivalent active work instead of creating duplicate operations", async () => {
    const db = new TestDatabase();
    const first = await enqueue(db, {
      entity: "product_master",
      op: "create",
      payload: { revision: 1 },
      dedupeKey: "product_master:ABC",
    });
    const second = await enqueue(db, {
      entity: "product_master",
      op: "update",
      payload: { revision: 2 },
      dedupeKey: "product_master:ABC",
    });

    expect(second.id).toBe(first.id);
    expect(second.op).toBe("update");
    expect(await db.count("outbox")).toBe(1);
  });

  it("counts an actual attempt once and backs off transient failures", async () => {
    const db = new TestDatabase();
    const queued = await enqueue(db, {
      entity: "product_master",
      op: "create",
      payload: {},
    });
    const attempt = await markInFlight(db, queued.id);
    const failed = await markFailed(db, queued.id, new Error("Failed to fetch"));

    expect(attempt?.attempts).toBe(1);
    expect(failed?.attempts).toBe(1);
    expect(failed?.status).toBe("pending");
    expect(failed?.retryable).toBe(true);
    expect(failed!.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("recovers in-flight work after restart and permits an explicit retry", async () => {
    const db = new TestDatabase();
    const queued = await enqueue(db, {
      entity: "product_master",
      op: "create",
      payload: {},
    });
    await markInFlight(db, queued.id);

    expect(await recoverInterrupted(db)).toBe(1);
    let recovered = await db.get<OutboxRecord>("outbox", queued.id);
    expect(recovered?.status).toBe("pending");
    expect(recovered?.errorCode).toBe("INTERRUPTED_RESTART");

    await markFailed(db, queued.id, { code: "42501", message: "permission denied" });
    await retryNow(db, queued.id);
    recovered = await db.get<OutboxRecord>("outbox", queued.id);
    expect(recovered?.status).toBe("pending");
    expect(recovered?.retryable).toBe(true);
  });
});
