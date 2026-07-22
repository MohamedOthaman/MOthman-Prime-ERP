export type TableName =
  | "products"
  | "customers"
  | "salesmen"
  | "brands"
  | "warehouses"
  | "sales_headers_local"
  | "sales_lines_local"
  | "outbox"
  | "meta";

export interface QueryFilter {
  /** field name in the local table */
  field: string;
  /** equality value */
  equals?: unknown;
  /** "in" predicate */
  in?: unknown[];
}

export interface QueryOptions {
  filters?: QueryFilter[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface DatabaseAdapter {
  /** Open the underlying store and apply migrations. Safe to call multiple times. */
  init(): Promise<void>;

  /** Read a single record by primary key. */
  get<T = unknown>(table: TableName, id: string): Promise<T | null>;

  /** Insert or replace a record. */
  put<T = unknown>(table: TableName, record: T): Promise<void>;

  /** Bulk upsert. */
  bulkPut<T = unknown>(table: TableName, records: T[]): Promise<void>;

  /** Delete by primary key. */
  delete(table: TableName, id: string): Promise<void>;

  /** Query with optional filters / sort / pagination. */
  query<T = unknown>(table: TableName, options?: QueryOptions): Promise<T[]>;

  /** Count rows matching the filters. */
  count(table: TableName, options?: Pick<QueryOptions, "filters">): Promise<number>;

  /** Clear all rows in a table. */
  clear(table: TableName): Promise<void>;

  /** Run a callback inside a transaction across the listed tables. */
  transaction<T>(tables: TableName[], fn: () => Promise<T>): Promise<T>;

  /** Close and release resources. */
  close(): Promise<void>;
}

export interface OutboxRecord {
  id: string;
  entity: string;
  op: "create" | "update" | "delete";
  payload: unknown;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
  deviceId: string;
  /** "pending" | "in_flight" | "succeeded" | "failed_permanent" */
  status: "pending" | "in_flight" | "succeeded" | "failed_permanent";
  /** epoch ms when the next retry is allowed */
  nextAttemptAt: number;
  /** Human-readable summary of what this operation is (e.g. "Edit product X"). */
  label?: string;
  /** True when the last failure is permanent (retry is pointless until fixed). */
  permanent?: boolean;
  /** Stable key used to replace an equivalent queued operation instead of duplicating it. */
  dedupeKey?: string;
  /** Product/item identity shown in the Sync Log without parsing arbitrary payloads. */
  itemCode?: string;
  entityName?: string;
  localRecordId?: string;
  remoteRecordId?: string;
  /** Structured failure details retained independently from the display message. */
  errorCode?: string;
  errorHint?: string;
  errorDetails?: string;
  retryable?: boolean;
  firstFailureAt?: number;
  lastAttemptAt?: number;
  /** Whether the affected record exists locally, remotely, or only partially remotely. */
  syncState?: "local_only" | "remote" | "partial_remote" | "pending" | "unknown";
}
