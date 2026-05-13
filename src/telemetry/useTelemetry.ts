import { useEffect, useState } from "react";
import { metrics } from "./metrics";
import { useDatabase } from "@/database/DatabaseProvider";
import type { DatabaseAdapter, TableName } from "@/database/types";

export interface LocalStorageEstimate {
  usageBytes: number | null;
  quotaBytes: number | null;
  percent: number | null;
}

const TABLES_TO_PROFILE: TableName[] = [
  "products",
  "customers",
  "salesmen",
  "brands",
  "warehouses",
  "sales_headers_local",
  "sales_lines_local",
  "outbox",
];

async function estimateStorage(): Promise<LocalStorageEstimate> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null, percent: null };
  }
  try {
    const est = await navigator.storage.estimate();
    const usageBytes = est.usage ?? null;
    const quotaBytes = est.quota ?? null;
    const percent =
      usageBytes != null && quotaBytes && quotaBytes > 0
        ? Math.round((usageBytes / quotaBytes) * 100)
        : null;
    return { usageBytes, quotaBytes, percent };
  } catch {
    return { usageBytes: null, quotaBytes: null, percent: null };
  }
}

async function countTables(
  db: DatabaseAdapter
): Promise<Array<{ table: TableName; rowCount: number }>> {
  const out: Array<{ table: TableName; rowCount: number }> = [];
  for (const t of TABLES_TO_PROFILE) {
    try {
      const c = await db.count(t);
      out.push({ table: t, rowCount: c });
    } catch {
      out.push({ table: t, rowCount: 0 });
    }
  }
  return out;
}

async function outboxDepth(db: DatabaseAdapter): Promise<{
  pending: number;
  inFlight: number;
  failedPermanent: number;
  succeeded: number;
}> {
  const [pending, inFlight, failedPermanent, succeeded] = await Promise.all([
    db.count("outbox", { filters: [{ field: "status", equals: "pending" }] }),
    db.count("outbox", { filters: [{ field: "status", equals: "in_flight" }] }),
    db.count("outbox", { filters: [{ field: "status", equals: "failed_permanent" }] }),
    db.count("outbox", { filters: [{ field: "status", equals: "succeeded" }] }),
  ]).catch(() => [0, 0, 0, 0]);
  return { pending, inFlight, failedPermanent, succeeded };
}

export function useTelemetrySnapshot(refreshIntervalMs = 5_000) {
  const db = useDatabase();
  const [snap, setSnap] = useState(metrics.snapshot());
  const [tableCounts, setTableCounts] = useState<Array<{ table: TableName; rowCount: number }>>([]);
  const [outbox, setOutbox] = useState({ pending: 0, inFlight: 0, failedPermanent: 0, succeeded: 0 });
  const [storage, setStorage] = useState<LocalStorageEstimate>({
    usageBytes: null,
    quotaBytes: null,
    percent: null,
  });

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      if (!mounted) return;
      setSnap(metrics.snapshot());
      const [counts, ob, st] = await Promise.all([
        countTables(db),
        outboxDepth(db),
        estimateStorage(),
      ]);
      if (!mounted) return;
      setTableCounts(counts);
      setOutbox(ob);
      setStorage(st);
    };

    void refresh();
    const interval = window.setInterval(refresh, refreshIntervalMs);
    const unsub = metrics.subscribe(() => setSnap(metrics.snapshot()));
    return () => {
      mounted = false;
      window.clearInterval(interval);
      unsub();
    };
  }, [db, refreshIntervalMs]);

  return { snap, tableCounts, outbox, storage };
}
