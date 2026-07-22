import type { OutboxRecord } from "@/database/types";
import { registerHandler } from "./index";
import {
  PRODUCT_MASTER_ENTITY,
  persistProductMasterRemote,
  type ProductMasterSaveInput,
} from "@/features/products/productMasterService";

async function handler(record: OutboxRecord) {
  const input = record.payload as ProductMasterSaveInput;
  const result = await persistProductMasterRemote(input);
  return { remoteRecordId: result.productId, syncState: "remote" as const };
}

let registered = false;

/** Idempotent registration — safe to call multiple times. */
export function ensureProductMasterHandlersRegistered(): void {
  if (registered) return;
  registerHandler(PRODUCT_MASTER_ENTITY, "create", handler);
  registerHandler(PRODUCT_MASTER_ENTITY, "update", handler);
  registered = true;
}
