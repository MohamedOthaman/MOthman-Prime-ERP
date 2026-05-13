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

export interface SchemaVersion {
  version: number;
  /** Full table definitions valid at this version. Dexie needs the full set each version. */
  tables: TableSpec[];
}

// Append a new SchemaVersion entry (do NOT mutate existing ones) whenever the
// physical shape of the local store changes. Dexie auto-upgrades between
// declared versions; SQLite picks up new tables idempotently via CREATE TABLE
// IF NOT EXISTS. Cross-version data transforms live in `migrations/`.

const V1_TABLES: TableSpec[] = [
  { name: "products",            primaryKey: "id", indexes: ["item_code", "name", "primary_barcode"] },
  { name: "customers",           primaryKey: "id", indexes: ["code", "name", "salesman_id"] },
  { name: "salesmen",            primaryKey: "id", indexes: ["code", "name"] },
  { name: "brands",              primaryKey: "id", indexes: ["name"] },
  { name: "warehouses",          primaryKey: "id", indexes: ["code", "name"] },

  { name: "sales_headers_local", primaryKey: "id", indexes: ["status", "invoice_date", "customer_id", "[status+invoice_date]"] },
  { name: "sales_lines_local",   primaryKey: "id", indexes: ["header_id", "product_id"] },

  { name: "outbox",              primaryKey: "id", indexes: ["status", "entity", "createdAt", "nextAttemptAt", "[status+nextAttemptAt]"] },

  { name: "meta",                primaryKey: "key", indexes: [] },
];

export const SCHEMA_VERSIONS: SchemaVersion[] = [
  { version: 1, tables: V1_TABLES },
];

export const SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].version;

/** Convenience accessor for the latest table set (used by the SQLite adapter). */
export const TABLES: TableSpec[] = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].tables;