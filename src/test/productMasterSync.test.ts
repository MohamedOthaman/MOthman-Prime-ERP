import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxRecord } from "@/database/types";
import type { ProductMasterSaveInput } from "@/features/products/productMasterService";
import { TestDatabase } from "./testDatabase";

const mocks = vi.hoisted(() => ({
  role: "owner",
  getUser: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
    storage: {
      from: () => ({ upload: mocks.upload }),
    },
  },
}));

import {
  persistProductMasterRemote,
  saveProductMasterLocalFirst,
} from "@/features/products/productMasterService";

function input(overrides: Partial<ProductMasterSaveInput> = {}): ProductMasterSaveInput {
  return {
    mode: "create",
    productId: null,
    isActive: true,
    payload: {
      itemCode: "SYNC-TEST-1",
      nameAr: null,
      nameEn: "Sync test",
      category: "Test",
      uom: "EA",
      storageType: "Dry",
      barcodes: ["SYNC-TEST-1"],
      costPrice: 1,
      sellingPrice: 2,
      discount: 0,
    },
    metadata: {
      brand: "Test",
      category: "Test",
      section: null,
      packaging: "EA",
      carton_holds: null,
      pack_size: null,
      uom: "EA",
      storage_type: "Dry",
    },
    batches: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "owner";
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-owner" } },
    error: null,
  });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "upsert_product_master") {
      return { data: { product_id: "remote-product-1" }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "user-owner",
                full_name: "Test User",
                email: "test@example.com",
                role: mocks.role,
                is_active: true,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table !== "products") throw new Error(`Unexpected table ${table}`);
    return {
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: { id: "remote-product-1" }, error: null }),
          }),
        }),
      }),
    };
  });
});

describe("product local-first result states", () => {
  it("reports database success + missing image bucket as partial remote and replay-safe", async () => {
    const db = new TestDatabase();
    mocks.upload.mockResolvedValue({
      error: { message: "Bucket not found", statusCode: "404" },
    });
    const saveInput = input({
      imageUpload: {
        objectKey: "products/SYNC-TEST-1-fixed.jpg",
        contentType: "image/jpeg",
        base64: btoa("image-bytes"),
      },
    });

    const result = await saveProductMasterLocalFirst(db, saveInput);
    const rows = await db.query<OutboxRecord>("outbox");
    const local = await db.get<any>("products", "remote-product-1");

    expect(result.synced).toBe(false);
    expect(result.productId).toBe("remote-product-1");
    expect(result.syncState).toBe("partial_remote");
    expect(result.error?.code).toBe("BUCKET_MISSING");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "failed_permanent",
      remoteRecordId: "remote-product-1",
      syncState: "partial_remote",
      dedupeKey: "product_master:SYNC-TEST-1",
    });
    expect((rows[0].payload as ProductMasterSaveInput).mode).toBe("update");
    expect((rows[0].payload as ProductMasterSaveInput).imageUpload?.objectKey).toBe(
      "products/SYNC-TEST-1-fixed.jpg"
    );
    expect(local.image_path).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns fully synchronized when the product succeeds without an image", async () => {
    const db = new TestDatabase();
    const result = await saveProductMasterLocalFirst(db, input());

    expect(result).toMatchObject({
      synced: true,
      imageSynced: true,
      productId: "remote-product-1",
      syncState: "remote",
    });
    expect(await db.count("outbox")).toBe(0);
  });

  it("blocks the insecure legacy definer RPC when the resolved role is read_only", async () => {
    const db = new TestDatabase();
    mocks.role = "read_only";

    const result = await saveProductMasterLocalFirst(db, input());
    const row = (await db.query<OutboxRecord>("outbox"))[0];

    expect(result.syncState).toBe("local_only");
    expect(result.error?.code).toBe("42501");
    expect(row.status).toBe("failed_permanent");
    expect(mocks.rpc).not.toHaveBeenCalledWith("upsert_product_master", expect.anything());
  });

  it("keeps an auth connectivity failure retryable instead of calling it an expired session", async () => {
    const db = new TestDatabase();
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Failed to fetch" },
    });

    const result = await saveProductMasterLocalFirst(db, input());
    const row = (await db.query<OutboxRecord>("outbox"))[0];

    expect(result.error?.retryable).toBe(true);
    expect(row.status).toBe("pending");
    expect(row.errorCode).toBe("NETWORK_UNAVAILABLE");
  });

  it("replays a partial image with the same remote id and object key", async () => {
    const db = new TestDatabase();
    const prepared = {
      objectKey: "products/SYNC-TEST-1-stable.jpg",
      contentType: "image/jpeg",
      base64: btoa("stable-image"),
    };
    mocks.upload.mockResolvedValueOnce({ error: { message: "Bucket not found" } });
    await saveProductMasterLocalFirst(db, input({ imageUpload: prepared }));
    const queued = (await db.query<OutboxRecord>("outbox"))[0];
    const replay = queued.payload as ProductMasterSaveInput;

    mocks.upload.mockResolvedValue({ data: { path: prepared.objectKey }, error: null });
    await persistProductMasterRemote(replay);
    await persistProductMasterRemote(replay);

    expect(replay).toMatchObject({ mode: "update", productId: "remote-product-1" });
    expect(mocks.upload).toHaveBeenLastCalledWith(
      prepared.objectKey,
      expect.any(Blob),
      expect.objectContaining({ upsert: true })
    );
    const atomicCalls = mocks.rpc.mock.calls.filter(([name]) => name === "upsert_product_master");
    expect(atomicCalls.slice(-2).every(([, args]) => args.p_product_id === "remote-product-1")).toBe(true);
  });
});
