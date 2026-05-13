import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

const STORAGE_KEY = "food-choice-erp.query-cache";

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => idbGet<string>(key).then((v) => v ?? null),
    setItem: (key, value) => idbSet(key, value),
    removeItem: (key) => idbDel(key),
  },
  key: STORAGE_KEY,
  throttleTime: 1000,
});

const PERSIST_WHITELIST = new Set([
  "lookups",
  "products",
  "customers",
  "salesmen",
  "brands",
  "warehouses",
]);

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  return queryKey.some(
    (segment) => typeof segment === "string" && PERSIST_WHITELIST.has(segment)
  );
}
