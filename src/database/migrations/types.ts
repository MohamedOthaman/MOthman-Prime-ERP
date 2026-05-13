import type { DatabaseAdapter } from "@/database/types";

export interface DataMigration {
  /** Monotonically increasing; gaps are allowed (skipped versions are treated as applied). */
  version: number;
  /** Human-readable label, surfaced in logs and the admin telemetry view. */
  name: string;
  /** Idempotent migration body. Receives the live adapter — use db.transaction(...) for atomicity. */
  run(db: DatabaseAdapter): Promise<void>;
}

export interface MigrationResult {
  version: number;
  name: string;
  status: "skipped" | "applied" | "failed";
  durationMs: number;
  error?: string;
}