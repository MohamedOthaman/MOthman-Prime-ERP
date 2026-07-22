import { describe, expect, it } from "vitest";
import type { OutboxRecord } from "@/database/types";
import { mergeRemoteWithPendingProducts } from "@/features/products/useLocalFirstProducts";

function outbox(status: OutboxRecord["status"], itemCode: string): OutboxRecord {
  return {
    id: `outbox-${status}-${itemCode}`,
    entity: "product_master",
    op: "create",
    payload: { payload: { itemCode } },
    itemCode,
    createdAt: 1,
    updatedAt: 1,
    attempts: 1,
    lastError: null,
    deviceId: "device",
    status,
    nextAttemptAt: 1,
  };
}

describe("local-first product catalog merge", () => {
  it("keeps a local-only failed product visible after a successful cloud refresh", () => {
    const merged = mergeRemoteWithPendingProducts(
      [],
      [{ id: "local:product:LOCAL-1", item_code: "LOCAL-1", name: "Local product" }],
      [outbox("failed_permanent", "LOCAL-1")]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ item_code: "LOCAL-1", name: "Local product" });
  });

  it("shows pending local edits over the remote row until replay succeeds", () => {
    const remote = [{ id: "remote-1", item_code: "EDIT-1", name: "Old name" }] as any;
    const local = [{ id: "remote-1", item_code: "EDIT-1", name: "New local name" }];

    const pending = mergeRemoteWithPendingProducts(remote, local, [outbox("pending", "EDIT-1")]);
    const succeeded = mergeRemoteWithPendingProducts(remote, local, [outbox("succeeded", "EDIT-1")]);

    expect(pending[0].name).toBe("New local name");
    expect(succeeded[0].name).toBe("Old name");
  });
});
