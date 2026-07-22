import { useEffect, useState } from "react";
import { useDatabase } from "@/database/DatabaseProvider";
import type { OutboxRecord } from "@/database/types";
import { countByStatus } from "./outbox";

export interface SyncStatus {
  pending: number;
  inFlight: number;
  failedPermanent: number;
  lastUpdatedAt: number | null;
  latestFailure: OutboxRecord | null;
}

const POLL_MS = 4_000;

export function useSyncStatus(): SyncStatus {
  const db = useDatabase();
  const [status, setStatus] = useState<SyncStatus>({
    pending: 0,
    inFlight: 0,
    failedPermanent: 0,
    lastUpdatedAt: null,
    latestFailure: null,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [pending, inFlight, failedPermanent, failures] = await Promise.all([
          countByStatus(db, "pending"),
          countByStatus(db, "in_flight"),
          countByStatus(db, "failed_permanent"),
          db.query<OutboxRecord>("outbox", {
            filters: [{ field: "status", equals: "failed_permanent" }],
            orderBy: { field: "updatedAt", direction: "desc" },
            limit: 1,
          }),
        ]);
        if (cancelled) return;
        setStatus({
          pending,
          inFlight,
          failedPermanent,
          lastUpdatedAt: Date.now(),
          latestFailure: failures[0] ?? null,
        });
      } catch {
        /* ignore — DB may be transitioning */
      }
    };

    void refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [db]);

  return status;
}

export type { OutboxRecord };
