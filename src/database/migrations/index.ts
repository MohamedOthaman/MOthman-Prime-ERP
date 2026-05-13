import type { DatabaseAdapter } from "@/database/types";
import type { DataMigration, MigrationResult } from "./types";

/**
 * Append new data migrations here. They run AFTER the structural Dexie / SQLite
 * upgrade chain has completed, so they can read existing rows and back-fill
 * derived state. Keep each one idempotent — they may run in dry-run scenarios
 * during testing.
 */
const REGISTRY: DataMigration[] = [
  // Example placeholder for future migrations. Intentionally empty in v1.
];

const APPLIED_KEY = (version: number) => `schema.applied.v${version}`;

interface AppliedRow {
  key: string;
  value: { appliedAt: number; name: string };
}

export async function runDataMigrations(
  db: DatabaseAdapter
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  for (const m of REGISTRY) {
    const key = APPLIED_KEY(m.version);
    const existing = await db.get<AppliedRow>("meta", key);
    if (existing) {
      results.push({
        version: m.version,
        name: m.name,
        status: "skipped",
        durationMs: 0,
      });
      continue;
    }

    const start = Date.now();
    try {
      await m.run(db);
      await db.put<AppliedRow>("meta", {
        key,
        value: { appliedAt: Date.now(), name: m.name },
      });
      results.push({
        version: m.version,
        name: m.name,
        status: "applied",
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const error = err as Error;
      results.push({
        version: m.version,
        name: m.name,
        status: "failed",
        durationMs: Date.now() - start,
        error: error.message,
      });
      // Stop on the first failure so subsequent migrations don't run against
      // a partially-migrated DB.
      break;
    }
  }

  return results;
}

export async function listAppliedMigrations(
  db: DatabaseAdapter
): Promise<Array<{ version: number; name: string; appliedAt: number }>> {
  const out: Array<{ version: number; name: string; appliedAt: number }> = [];
  for (const m of REGISTRY) {
    const row = await db.get<AppliedRow>("meta", APPLIED_KEY(m.version));
    if (row) {
      out.push({
        version: m.version,
        name: row.value.name,
        appliedAt: row.value.appliedAt,
      });
    }
  }
  return out;
}

export type { DataMigration, MigrationResult };