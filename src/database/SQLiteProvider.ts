import type {
  DatabaseAdapter,
  QueryFilter,
  QueryOptions,
  TableName,
} from "./types";
import { SCHEMA_VERSION, TABLES } from "./schema";

/**
 * Tauri SQLite adapter, loaded lazily so the bundle doesn't pull in
 * @tauri-apps/plugin-sql on the web/Capacitor builds.
 *
 * Records are stored as JSON in a single "data" column with the primary
 * key promoted to a real column for efficient lookup. This keeps the
 * schema permissive and matches the IndexedDB adapter's shape exactly,
 * which makes the two interchangeable from the application's point of view.
 */
export class SQLiteProvider implements DatabaseAdapter {
  private db: { execute: (...args: unknown[]) => Promise<unknown>; select: (...args: unknown[]) => Promise<unknown>; close: () => Promise<void> } | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    const mod = await import("@tauri-apps/plugin-sql");
    const Database = mod.default;
    this.db = (await Database.load(
      `sqlite:food-choice-erp-v${SCHEMA_VERSION}.db`
    )) as unknown as typeof this.db;

    if (!this.db) throw new Error("Failed to load SQLite database");

    for (const spec of TABLES) {
      await this.db.execute(
        `CREATE TABLE IF NOT EXISTS "${spec.name}" (
          "${spec.primaryKey}" TEXT PRIMARY KEY,
          data TEXT NOT NULL
        )`
      );
      for (const idx of spec.indexes) {
        if (idx.startsWith("[")) continue; // skip compound indexes (Dexie style)
        const idxName = `idx_${spec.name}_${idx}`;
        // Index on the JSON-extracted value for the field.
        await this.db.execute(
          `CREATE INDEX IF NOT EXISTS "${idxName}" ON "${spec.name}" ((json_extract(data, '$.${idx}')))`
        );
      }
    }
  }

  private requireDb() {
    if (!this.db) throw new Error("SQLiteProvider not initialised");
    return this.db;
  }

  private primaryKey(table: TableName): string {
    const spec = TABLES.find((t) => t.name === table);
    if (!spec) throw new Error(`Unknown table: ${table}`);
    return spec.primaryKey;
  }

  async get<T = unknown>(table: TableName, id: string): Promise<T | null> {
    const db = this.requireDb();
    const pk = this.primaryKey(table);
    const rows = (await db.select(
      `SELECT data FROM "${table}" WHERE "${pk}" = $1 LIMIT 1`,
      [id]
    )) as { data: string }[];
    if (!rows.length) return null;
    return JSON.parse(rows[0].data) as T;
  }

  async put<T = unknown>(table: TableName, record: T): Promise<void> {
    const db = this.requireDb();
    const pk = this.primaryKey(table);
    const id = (record as Record<string, unknown>)[pk] as string;
    if (!id) throw new Error(`Record missing primary key "${pk}"`);
    await db.execute(
      `INSERT OR REPLACE INTO "${table}" ("${pk}", data) VALUES ($1, $2)`,
      [id, JSON.stringify(record)]
    );
  }

  async bulkPut<T = unknown>(table: TableName, records: T[]): Promise<void> {
    for (const record of records) {
      await this.put(table, record);
    }
  }

  async delete(table: TableName, id: string): Promise<void> {
    const db = this.requireDb();
    const pk = this.primaryKey(table);
    await db.execute(`DELETE FROM "${table}" WHERE "${pk}" = $1`, [id]);
  }

  async query<T = unknown>(
    table: TableName,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const db = this.requireDb();
    const rows = (await db.select(`SELECT data FROM "${table}"`)) as {
      data: string;
    }[];
    let parsed = rows.map((r) => JSON.parse(r.data) as Record<string, unknown>);

    if (options.filters?.length) {
      parsed = parsed.filter((r) => matchesFilters(r, options.filters!));
    }

    if (options.orderBy) {
      const field = options.orderBy.field;
      const direction = options.orderBy.direction;
      parsed.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        const result = (av as number | string) > (bv as number | string) ? 1 : -1;
        return direction === "desc" ? -result : result;
      });
    }

    const start = options.offset ?? 0;
    const end = options.limit != null ? start + options.limit : parsed.length;
    return parsed.slice(start, end) as T[];
  }

  async count(
    table: TableName,
    options: Pick<QueryOptions, "filters"> = {}
  ): Promise<number> {
    const db = this.requireDb();
    if (!options.filters?.length) {
      const rows = (await db.select(`SELECT COUNT(*) as c FROM "${table}"`)) as {
        c: number;
      }[];
      return rows[0]?.c ?? 0;
    }
    const rows = (await db.select(`SELECT data FROM "${table}"`)) as {
      data: string;
    }[];
    return rows.filter((r) =>
      matchesFilters(JSON.parse(r.data) as Record<string, unknown>, options.filters!)
    ).length;
  }

  async clear(table: TableName): Promise<void> {
    const db = this.requireDb();
    await db.execute(`DELETE FROM "${table}"`);
  }

  async transaction<T>(_tables: TableName[], fn: () => Promise<T>): Promise<T> {
    const db = this.requireDb();
    await db.execute("BEGIN");
    try {
      const result = await fn();
      await db.execute("COMMIT");
      return result;
    } catch (err) {
      await db.execute("ROLLBACK");
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

function matchesFilters(
  row: Record<string, unknown>,
  filters: QueryFilter[]
): boolean {
  for (const f of filters) {
    const value = row[f.field];
    if (f.equals !== undefined && value !== f.equals) return false;
    if (f.in && !f.in.includes(value)) return false;
  }
  return true;
}