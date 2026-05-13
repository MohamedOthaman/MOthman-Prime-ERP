import Dexie, { type Table } from "dexie";
import type {
  DatabaseAdapter,
  QueryOptions,
  QueryFilter,
  TableName,
} from "./types";
import { SCHEMA_VERSIONS } from "./schema";

class FoodChoiceDexie extends Dexie {
  constructor() {
    super("food-choice-erp");

    // Declare every schema version in order so Dexie can perform the
    // structural upgrade chain for users on older installs.
    for (const sv of SCHEMA_VERSIONS) {
      const stores: Record<string, string> = {};
      for (const spec of sv.tables) {
        const primary = `&${spec.primaryKey}`;
        stores[spec.name] = [primary, ...spec.indexes].join(",");
      }
      this.version(sv.version).stores(stores);
    }
  }
}

function matchesFilters(row: Record<string, unknown>, filters: QueryFilter[]): boolean {
  for (const f of filters) {
    const value = row[f.field];
    if (f.equals !== undefined && value !== f.equals) return false;
    if (f.in && !f.in.includes(value)) return false;
  }
  return true;
}

export class IndexedDBProvider implements DatabaseAdapter {
  private db: FoodChoiceDexie | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = new FoodChoiceDexie();
    await this.db.open();
  }

  private getTable(name: TableName): Table<Record<string, unknown>, string> {
    if (!this.db) throw new Error("IndexedDBProvider not initialised");
    return this.db.table(name);
  }

  async get<T = unknown>(table: TableName, id: string): Promise<T | null> {
    const result = await this.getTable(table).get(id);
    return (result ?? null) as T | null;
  }

  async put<T = unknown>(table: TableName, record: T): Promise<void> {
    await this.getTable(table).put(record as Record<string, unknown>);
  }

  async bulkPut<T = unknown>(table: TableName, records: T[]): Promise<void> {
    if (records.length === 0) return;
    await this.getTable(table).bulkPut(records as Record<string, unknown>[]);
  }

  async delete(table: TableName, id: string): Promise<void> {
    await this.getTable(table).delete(id);
  }

  async query<T = unknown>(table: TableName, options: QueryOptions = {}): Promise<T[]> {
    const dxTable = this.getTable(table);
    let collection = dxTable.toCollection();

    if (options.orderBy) {
      // Dexie .sortBy() materializes — that's fine for the sizes we deal with locally.
      let rows = (await collection.sortBy(options.orderBy.field)) as Record<
        string,
        unknown
      >[];
      if (options.orderBy.direction === "desc") rows = rows.reverse();
      if (options.filters?.length) {
        rows = rows.filter((r) => matchesFilters(r, options.filters!));
      }
      const start = options.offset ?? 0;
      const end =
        options.limit != null ? start + options.limit : rows.length;
      return rows.slice(start, end) as T[];
    }

    if (options.filters?.length) {
      collection = collection.filter((r) =>
        matchesFilters(r as Record<string, unknown>, options.filters!)
      );
    }
    if (options.offset) collection = collection.offset(options.offset);
    if (options.limit != null) collection = collection.limit(options.limit);

    const rows = await collection.toArray();
    return rows as T[];
  }

  async count(
    table: TableName,
    options: Pick<QueryOptions, "filters"> = {}
  ): Promise<number> {
    const dxTable = this.getTable(table);
    if (!options.filters?.length) return dxTable.count();

    let collection = dxTable.toCollection();
    collection = collection.filter((r) =>
      matchesFilters(r as Record<string, unknown>, options.filters!)
    );
    return collection.count();
  }

  async clear(table: TableName): Promise<void> {
    await this.getTable(table).clear();
  }

  async transaction<T>(tables: TableName[], fn: () => Promise<T>): Promise<T> {
    if (!this.db) throw new Error("IndexedDBProvider not initialised");
    const dexieAny = this.db as unknown as {
      transaction: (mode: "rw", stores: unknown, cb: () => Promise<T>) => Promise<T>;
    };
    const stores = tables.map((t) => this.db!.table(t));
    return dexieAny.transaction("rw", stores, fn);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}
