import type { TableName } from "./types";

export interface TableSpec {
  name: TableName;
  primaryKey: string;
  /**
   * Indexes (compound supported via "[a+b]" notation, Dexie style).
   * For SQLite these get translated into CREATE INDEX statements.
   */
  indexes: string[];
}

export const SCHEMA_VERSION = 1;

export const TABLES: TableSpec[] = [
  { name: "products",            primaryKey: "id", indexes: ["item_code", "name", "primary_barcode"] },
  { name: "customers",           primaryKey: "id", indexes: ["code", "name", "salesman_id"] },
  { name: "salesmen",            primaryKey: "id", indexes: ["code", "name"] },
  { name: "brands",              primaryKey: "id", indexes: ["name"] },
  { name: "warehouses",          primaryKey: "id", indexes: ["code", "name"] },

  // Local-first transactional mirrors (offline created/edited drafts).
  // They live alongside server-truth rows once synced, keyed by the same UUID.
  { name: "sales_headers_local", primaryKey: "id", indexes: ["status", "invoice_date", "customer_id", "[status+invoice_date]"] },
  { name: "sales_lines_local",   primaryKey: "id", indexes: ["header_id", "product_id"] },

  // Sync outbox
  { name: "outbox",              primaryKey: "id", indexes: ["status", "entity", "createdAt", "nextAttemptAt", "[status+nextAttemptAt]"] },

  // Misc metadata (schema version, device id, last full-sync timestamps per entity).
  { name: "meta",                primaryKey: "key", indexes: [] },
];
