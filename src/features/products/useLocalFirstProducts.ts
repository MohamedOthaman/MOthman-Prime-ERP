import { useCallback, useEffect, useRef, useState } from "react";
import { useDatabase } from "@/database/DatabaseProvider";
import {
  getInventoryProductCatalog,
  type InventoryProductCatalogRow,
} from "@/features/services/inventoryService";
import type { OutboxRecord } from "@/database/types";
import { PRODUCT_MASTER_ENTITY, type ProductMasterSaveInput } from "./productMasterService";

export type ProductDataSource = "none" | "local" | "network";

export interface LocalFirstProductsState {
  rows: InventoryProductCatalogRow[];
  /** Where the currently displayed rows came from. */
  source: ProductDataSource;
  /** True only until the LOCAL read finishes — never blocks on the network. */
  loading: boolean;
  /** True while a background network refresh is in flight. */
  refreshing: boolean;
  /** Last network refresh error, if the local rows are being shown stale. */
  error: string | null;
  refresh: () => Promise<void>;
}

function normalizeLocalRow(row: any): InventoryProductCatalogRow {
  return {
    id: row.id,
    code: row.code ?? null,
    item_code: row.item_code ?? null,
    internal_code: row.internal_code ?? null,
    name: row.name ?? null,
    name_ar: row.name_ar ?? null,
    name_en: row.name_en ?? null,
    brand: row.brand ?? null,
    category: row.category ?? null,
    section: row.section ?? null,
    uom: row.uom ?? null,
    pack_size: row.pack_size ?? null,
    packaging: row.packaging ?? null,
    storage_type: row.storage_type ?? null,
    carton_holds: row.carton_holds != null ? Number(row.carton_holds) : null,
    primary_barcode: row.primary_barcode ?? null,
    all_barcodes: Array.isArray(row.all_barcodes) ? row.all_barcodes : [],
    cost_price: row.cost_price != null ? Number(row.cost_price) : null,
    selling_price: row.selling_price != null ? Number(row.selling_price) : null,
    discount: row.discount != null ? Number(row.discount) : null,
    price_source: row.price_source ?? null,
    image_path: row.image_path ?? null,
    is_active: row.is_active !== false,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function mergeRemoteWithPendingProducts(
  remote: InventoryProductCatalogRow[],
  local: any[],
  outbox: OutboxRecord[]
): InventoryProductCatalogRow[] {
  const active = outbox.filter(
    (row) => row.entity === PRODUCT_MASTER_ENTITY && row.status !== "succeeded"
  );
  const activeCodes = new Set(
    active
      .map((row) => row.itemCode ?? (row.payload as ProductMasterSaveInput | undefined)?.payload?.itemCode)
      .filter((value): value is string => Boolean(value))
  );
  const localByCode = new Map(
    local
      .filter((row) => activeCodes.has(row.item_code))
      .map((row) => [row.item_code, row] as const)
  );

  const merged = remote.map((row) => {
    const code = row.item_code ?? row.code ?? "";
    const pending = localByCode.get(code);
    return pending ? normalizeLocalRow({ ...row, ...pending, id: row.id }) : row;
  });
  const remoteCodes = new Set(remote.map((row) => row.item_code ?? row.code));
  for (const [code, row] of localByCode) {
    if (!remoteCodes.has(code)) merged.push(normalizeLocalRow(row));
  }
  return merged;
}

/**
 * Local-first product catalog.
 *
 * 1. Reads the local mirror (IndexedDB / SQLite) immediately — first paint is
 *    never blocked by the network or by a full-catalog download.
 * 2. Refreshes from Supabase in the background and updates both the UI and
 *    the local mirror when fresh data lands.
 * 3. When the cloud is unreachable the local rows simply stay on screen with
 *    `error` set, keeping daily operations alive offline.
 */
export function useLocalFirstProducts(): LocalFirstProductsState {
  const db = useDatabase();
  const [rows, setRows] = useState<InventoryProductCatalogRow[]>([]);
  const [source, setSource] = useState<ProductDataSource>("none");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const networkLandedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await getInventoryProductCatalog();
      const [local, outbox] = await Promise.all([
        db.query<any>("products"),
        db.query<OutboxRecord>("outbox"),
      ]);
      const visible = mergeRemoteWithPendingProducts(fresh, local, outbox);
      if (!aliveRef.current) return;
      networkLandedRef.current = true;
      setRows(visible);
      setSource("network");
      setError(null);
      // Keep the local mirror alive in the background (non-blocking). A full
      // catalog replaces the table so bundle-seeded rows and server-deleted
      // rows don't linger.
      void (async () => {
        await db.clear("products");
        await db.bulkPut("products", visible.map((r) => ({ ...r, _syncedAt: Date.now() })));
      })().catch(() => { /* mirror write failures must never break the page */ });
    } catch (err) {
      if (!aliveRef.current) return;
      setError((err as Error).message);
      // Cloud unreachable — re-read the local mirror so edits saved while
      // offline are still reflected on screen.
      try {
        const local = await db.query<any>("products", {
          orderBy: { field: "name", direction: "asc" },
        });
        if (aliveRef.current && local.length > 0 && !networkLandedRef.current) {
          setRows(local.map(normalizeLocalRow));
          setSource("local");
        }
      } catch { /* local store unavailable */ }
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [db]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Local mirror first — instant, works fully offline.
      try {
        const local = await db.query<any>("products", {
          orderBy: { field: "name", direction: "asc" },
        });
        if (!cancelled && !networkLandedRef.current && local.length > 0) {
          setRows(local.map(normalizeLocalRow));
          setSource("local");
        }
      } catch {
        // Local store unavailable — the network path below still covers us.
      }
      if (!cancelled) setLoading(false);

      // 2) Background network refresh.
      void refresh();
    })();

    return () => { cancelled = true; };
  }, [db, refresh]);

  return { rows, source, loading, refreshing, error, refresh };
}
