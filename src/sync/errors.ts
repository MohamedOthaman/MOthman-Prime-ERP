/**
 * Convert Supabase, PostgREST, Storage, and browser failures into a stable
 * shape that can be persisted in the outbox and shown without a console.
 */

export type SyncRecordState =
  | "local_only"
  | "remote"
  | "partial_remote"
  | "pending"
  | "unknown";

export interface ClassifiedError {
  message: string;
  /** True when an automatic retry is useful. */
  retryable: boolean;
  /** True when configuration, permission, or data must change first. */
  permanent: boolean;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  syncState?: SyncRecordState;
  localRecordId?: string;
  remoteRecordId?: string;
}

export interface SyncErrorMetadata {
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  retryable?: boolean;
  permanent?: boolean;
  syncState?: SyncRecordState;
  localRecordId?: string;
  remoteRecordId?: string;
}

/** Error type used when a sync stage knows more than a plain Error can carry. */
export class SyncOperationError extends Error implements SyncErrorMetadata {
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  retryable?: boolean;
  permanent?: boolean;
  syncState?: SyncRecordState;
  localRecordId?: string;
  remoteRecordId?: string;

  constructor(message: string, metadata: SyncErrorMetadata = {}) {
    super(message);
    this.name = "SyncOperationError";
    Object.assign(this, metadata);
  }
}

interface RawErrorish extends SyncErrorMetadata {
  message?: string;
  name?: string;
  code?: string;
  statusCode?: number | string;
  error?: string;
  error_description?: string;
}

const PERMANENT_PG_CODES = new Set([
  "42501", // insufficient_privilege / RLS
  "28000", // invalid_authorization
  "42P01", // undefined_table
  "42703", // undefined_column
  "22004", // required value missing
  "22P02", // invalid text representation / payload
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23505", // unique_violation
  "23514", // check_violation
  "P0001", // explicit application RAISE
  "NO_SYNC_HANDLER",
  "DEPENDENCY_FAILED",
  "INVALID_PAYLOAD",
  "SCHEMA_MISMATCH",
  "BUCKET_MISSING",
]);

function isPostgrestPermanent(code?: string): boolean {
  return Boolean(code && (/^PGRST2\d\d$/.test(code) || code === "PGRST301" || code === "PGRST302"));
}

function result(
  message: string,
  permanent: boolean,
  e: RawErrorish,
  code?: string,
  status?: number,
  hint?: string
): ClassifiedError {
  return {
    message,
    permanent,
    retryable: !permanent,
    code,
    status,
    details: e.details,
    hint: hint ?? e.hint,
    syncState: e.syncState,
    localRecordId: e.localRecordId,
    remoteRecordId: e.remoteRecordId,
  };
}

export function classifyError(raw: unknown): ClassifiedError {
  const e = (raw ?? {}) as RawErrorish;
  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : undefined;
  const code = e.code ?? (typeof e.statusCode === "string" ? e.statusCode : undefined);
  const message =
    e.message ||
    e.error_description ||
    e.error ||
    e.details ||
    (typeof raw === "string" ? raw : "") ||
    "Unknown sync error";

  // Preserve an explicit classification supplied by a stage-aware error.
  if (typeof e.permanent === "boolean" || typeof e.retryable === "boolean") {
    const permanent = e.permanent ?? e.retryable === false;
    return result(message, permanent, e, code, status);
  }

  if (/bucket (?:does not exist|not found)|bucketnotfound|storage is not provisioned/i.test(message) || code === "BUCKET_MISSING") {
    return result(
      message,
      true,
      e,
      "BUCKET_MISSING",
      status,
      "Storage migration 20260706120000_storage_buckets.sql must be reviewed and applied before image retry."
    );
  }

  if (/failed to fetch|networkerror|network request failed|timed? ?out|econn|enotfound|dns|fetch failed|load failed|offline/i.test(message)) {
    return result(
      message,
      false,
      e,
      code ?? "NETWORK_UNAVAILABLE",
      status,
      "The operation is saved locally and will retry automatically when connectivity returns."
    );
  }

  if (code === "23505" || status === 409 || /duplicate key|already exists|unique constraint/i.test(message)) {
    return result(
      message,
      true,
      e,
      code ?? "DUPLICATE_CONFLICT",
      status,
      "A conflicting product or barcode already exists. Inspect the existing record before retrying."
    );
  }

  if (code === "42501" || status === 403 || /row-level security|permission denied|not permitted|forbidden/i.test(message)) {
    return result(
      message,
      true,
      e,
      code ?? "PERMISSION_DENIED",
      status,
      "Your resolved profile role is not permitted to perform this operation."
    );
  }

  if (code === "28000" || status === 401 || code === "PGRST301" || code === "PGRST302" || /jwt.*expired|session.*expired|not signed in|unauthori[sz]ed/i.test(message)) {
    return result(
      message,
      true,
      e,
      code ?? "SESSION_REQUIRED",
      status,
      "Sign in again, then use Retry in the Sync Log."
    );
  }

  if (code && (PERMANENT_PG_CODES.has(code) || isPostgrestPermanent(code))) {
    const hint = code.startsWith("PGRST2") || code === "42P01" || code === "42703"
      ? "The server schema or RPC does not match this app version; a reviewed migration may be required."
      : "Correct the permission or data problem before retrying.";
    return result(message, true, e, code, status, hint);
  }

  if (status === 408 || status === 429) {
    return result(
      message,
      false,
      e,
      String(status),
      status,
      status === 429 ? "Rate limited; the operation will retry with backoff." : "The request timed out and will retry."
    );
  }

  if (typeof status === "number" && status >= 500) {
    return result(message, false, e, String(status), status, "Temporary server error; the operation will retry.");
  }

  if (typeof status === "number" && status >= 400 && status < 500) {
    return result(message, true, e, String(status), status, "The server rejected this request; review its data and permissions.");
  }

  return result(
    message,
    false,
    e,
    code,
    status,
    "The cause is not yet classified; retries are capped and the original error is preserved."
  );
}
