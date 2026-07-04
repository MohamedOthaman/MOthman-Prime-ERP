import { supabase } from "@/integrations/supabase/client";
import type { DatabaseAdapter, TableName } from "@/database/types";

export interface BootstrapResult {
  table: TableName;
  fetched: number;
  durationMs: number;
  error?: string;
  mode: "full" | "incremental" | "skipped";
}

interface SyncMetaRow {
  key: string;
  value: {
    lastSyncedAt: number;
    lastUpdatedAt: string | null;
    rowCount: number;
  };
}

const META_KEY = (table: TableName) => `bootstrap.${table}`;

/** Tables eligible for offline bootstrap — reference data only. */
const BOOTSTRAP_TARGETS: Array<{
  table: TableName;
  source: string;
  select: string;
  /** Column to use for incremental sync; falls back to full refresh if absent on the table. */
  watermarkColumn: string | null;
  /** Optional filter applied on initial AND incremental fetch. */
  activeFilter?: string;
}> = [
  {
    table: "products",
    source: "products_overview",
    select:
      "id, item_code, code, name, name_en, name_ar, brand, category, section, uom, pack_size, packaging, storage_type, carton_holds, primary_barcode, all_barcodes, cost_price, selling_price, discount, image_path, is_active, created_at, updated_at",
    watermarkColumn: null, // products_overview is a view; no reliable updated_at
    activeFilter: "is_active.eq.true,is_active.is.null",
  },
  {
    table: "customers",
    source: "customers",
    select: "id, code, name, name_ar, salesman_id, is_active, updated_at",
    watermarkColumn: "updated_at",
    activeFilter: "is_active.eq.true,is_active.is.null",
  },
  {
    table: "salesmen",
    source: "salesmen",
    select: "id, code, name, name_ar, is_active, updated_at",
    watermarkColumn: "updated_at",
    activeFilter: "is_active.eq.true,is_active.is.null",
  },
  {
    table: "warehouses",
    source: "warehouses",
    select: "id, code, name, name_ar, is_active, updated_at",
    watermarkColumn: "updated_at",
    activeFilter: "is_active.eq.true,is_active.is.null",
  },
  {
    table: "brands",
    source: "brands",
    select: "id, name, name_ar, updated_at",
    watermarkColumn: "updated_at",
  },
];

const PAGE_SIZE = 1000;
const DISABLED_FLAG = "bootstrap.disabled";

function isDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_FLAG) === "1";
  } catch {
    return false;
  }
}

async function fetchPaginated(
  source: string,
  select: string,
  filter: string | undefined,
  watermark: string | null,
  since: string | null
): Promise<{ rows: any[]; maxWatermark: string | null }> {
  const all: any[] = [];
  let from = 0;
  let maxWatermark: string | null = since;

  while (true) {
    let q = supabase
      .from(source as any)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);

    if (filter) q = q.or(filter);
    if (watermark) {
      q = q.order(watermark, { ascending: true });
      if (since) q = q.gt(watermark, since);
    } else {
      q = q.order("id" as any, { ascending: true });
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    all.push(...rows);

    if (watermark) {
      for (const r of rows) {
        const v = r[watermark];
        if (v && (!maxWatermark || v > maxWatermark)) maxWatermark = v;
      }
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows: all, maxWatermark };
}

export async function bootstrapTable(
  db: DatabaseAdapter,
  target: (typeof BOOTSTRAP_TARGETS)[number]
): Promise<BootstrapResult> {
  const start = Date.now();
  const existing = await db.get<SyncMetaRow>("meta", META_KEY(target.table));
  const hasLocal = !!existing && existing.value.rowCount > 0;
  const useIncremental = hasLocal && target.watermarkColumn != null;
  const since = useIncremental ? existing!.value.lastUpdatedAt : null;

  try {
    const { rows, maxWatermark } = await fetchPaginated(
      target.source,
      target.select,
      target.activeFilter,
      target.watermarkColumn,
      since
    );

    if (rows.length > 0) {
      // Tag every row with an offline _syncedAt marker so we can audit later.
      const stamped = rows.map((r) => ({ ...r, _syncedAt: Date.now() }));
      await db.bulkPut(target.table, stamped);
    }

    const rowCount = useIncremental
      ? (existing?.value.rowCount ?? 0) + rows.length
      : rows.length;

    await db.put<SyncMetaRow>("meta", {
      key: META_KEY(target.table),
      value: {
        lastSyncedAt: Date.now(),
        lastUpdatedAt: maxWatermark ?? existing?.value.lastUpdatedAt ?? null,
        rowCount,
      },
    });

    return {
      table: target.table,
      fetched: rows.length,
      durationMs: Date.now() - start,
      mode: useIncremental ? "incremental" : "full",
    };
  } catch (err) {
    return {
      table: target.table,
      fetched: 0,
      durationMs: Date.now() - start,
      mode: useIncremental ? "incremental" : "full",
      error: (err as Error).message,
    };
  }
}

export async function bootstrapAll(
  db: DatabaseAdapter,
  options?: { force?: boolean }
): Promise<BootstrapResult[]> {
  if (isDisabled()) {
    return BOOTSTRAP_TARGETS.map((t) => ({
      table: t.table,
      fetched: 0,
      durationMs: 0,
      mode: "skipped" as const,
    }));
  }

  if (options?.force) {
    for (const t of BOOTSTRAP_TARGETS) {
      await db.delete("meta", META_KEY(t.table));
    }
  }

  // Run sequentially to avoid hammering the network on a cold start.
  const out: BootstrapResult[] = [];
  for (const target of BOOTSTRAP_TARGETS) {
    out.push(await bootstrapTable(db, target));
  }
  return out;
}

export async function getBootstrapStatus(
  db: DatabaseAdapter
): Promise<Array<{ table: TableName; lastSyncedAt: number | null; rowCount: number }>> {
  const out: Array<{ table: TableName; lastSyncedAt: number | null; rowCount: number }> = [];
  for (const t of BOOTSTRAP_TARGETS) {
    const row = await db.get<SyncMetaRow>("meta", META_KEY(t.table));
    out.push({
      table: t.table,
      lastSyncedAt: row?.value.lastSyncedAt ?? null,
      rowCount: row?.value.rowCount ?? 0,
    });
  }
  return out;
}
