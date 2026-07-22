import type {
  DatabaseAdapter,
  QueryOptions,
  TableName,
} from "@/database/types";

export class TestDatabase implements DatabaseAdapter {
  private tables = new Map<TableName, Map<string, any>>();

  async init() {}

  private table(name: TableName) {
    let table = this.tables.get(name);
    if (!table) {
      table = new Map();
      this.tables.set(name, table);
    }
    return table;
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    return (this.table(table).get(id) as T | undefined) ?? null;
  }

  async put<T>(table: TableName, record: T): Promise<void> {
    const value = record as Record<string, unknown>;
    const id = (value.id ?? value.key) as string | undefined;
    if (!id) throw new Error("Test record has no primary key");
    this.table(table).set(id, structuredClone(record));
  }

  async bulkPut<T>(table: TableName, records: T[]): Promise<void> {
    for (const record of records) await this.put(table, record);
  }

  async delete(table: TableName, id: string): Promise<void> {
    this.table(table).delete(id);
  }

  async query<T>(table: TableName, options: QueryOptions = {}): Promise<T[]> {
    let rows = Array.from(this.table(table).values());
    for (const filter of options.filters ?? []) {
      rows = rows.filter((row) => {
        if (typeof filter.equals !== "undefined" && row[filter.field] !== filter.equals) return false;
        if (filter.in && !filter.in.includes(row[filter.field])) return false;
        return true;
      });
    }
    if (options.orderBy) {
      const { field, direction } = options.orderBy;
      rows.sort((a, b) => (a[field] === b[field] ? 0 : a[field] > b[field] ? 1 : -1));
      if (direction === "desc") rows.reverse();
    }
    const start = options.offset ?? 0;
    return rows.slice(start, options.limit == null ? undefined : start + options.limit) as T[];
  }

  async count(table: TableName, options: Pick<QueryOptions, "filters"> = {}): Promise<number> {
    return (await this.query(table, options)).length;
  }

  async clear(table: TableName): Promise<void> {
    this.table(table).clear();
  }

  async transaction<T>(_tables: TableName[], fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  async close() {}
}
