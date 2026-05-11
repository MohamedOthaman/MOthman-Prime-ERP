import { useEffect, useRef } from "react";
import { useDatabase } from "@/database/DatabaseProvider";
import { useOfflineStatus } from "@/offline/OfflineProvider";
import { createSyncWorker, type SyncWorker } from "./worker";

/**
 * Boots a singleton-per-mount sync worker that drains the outbox while
 * the user is authenticated and the device is online.
 */
export function useSyncWorker(): void {
  const db = useDatabase();
  const offline = useOfflineStatus();
  const workerRef = useRef<SyncWorker | null>(null);

  useEffect(() => {
    const worker = createSyncWorker(db, {
      isOnline: () => offline.isOnline && offline.supabaseReachable,
    });
    workerRef.current = worker;
    worker.start();
    return () => {
      worker.stop();
      workerRef.current = null;
    };
  }, [db]);

  useEffect(() => {
    if (offline.isOnline && offline.supabaseReachable) {
      void workerRef.current?.drain();
    }
  }, [offline.isOnline, offline.supabaseReachable]);
}