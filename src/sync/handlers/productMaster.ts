import type { OutboxRecord } from "@/database/types";
import { registerHandler } from "./index";
import {
  PRODUCT_MASTER_ENTITY,
  persistProductMasterRemote,
  type ProductMasterSaveInput,
} from "@/features/products/productMasterService";

async function handler(record: OutboxRecord): Promise<void> {
  const input = record.payload as ProductMasterSaveInput;
  // persistProductMasterRemote is replay-safe: a create whose item_code
  // already exists on the server switches to update semantics.
  await persistProductMasterRemote(input);
}

let registered = false;

/** Idempotent registration — safe to call multiple times. */
export function ensureProductMasterHandlersRegistered(): void {
  if (registered) return;
  registerHandler(PRODUCT_MASTER_ENTITY, "create", handler);
  registerHandler(PRODUCT_MASTER_ENTITY, "update", handler);
  registered = true;
}
