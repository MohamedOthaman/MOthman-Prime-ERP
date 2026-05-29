import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { getRuntimePlatform } from "@/platform/runtime";
import type { DatabaseAdapter } from "./types";
import { IndexedDBProvider } from "./IndexedDBProvider";
import { runDataMigrations } from "./migrations";

let cachedAdapter: DatabaseAdapter | null = null;

async function createAdapter(): Promise<DatabaseAdapter> {
  if (cachedAdapter) return cachedAdapter;

  const platform = getRuntimePlatform();
  let adapter: DatabaseAdapter | null = null;

  if (platform === "tauri") {
    try {
      const { SQLiteProvider } = await import("./SQLiteProvider");
      adapter = new SQLiteProvider();
      await adapter.init();
    } catch (err) {
      // Fall back to IndexedDB if the SQL plugin failed to load.
       
      console.warn(
        "[DatabaseProvider] SQLite init failed, falling back to IndexedDB",
        err
      );
      adapter = null;
    }
  }

  if (!adapter) {
    adapter = new IndexedDBProvider();
    await adapter.init();
  }

  const results = await runDataMigrations(adapter);
  const failures = results.filter((r) => r.status === "failed");
  if (failures.length > 0) {
     
    console.error("[DatabaseProvider] migration failures", failures);
  }

  cachedAdapter = adapter;
  return adapter;
}

const DatabaseContext = createContext<DatabaseAdapter | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [adapter, setAdapter] = useState<DatabaseAdapter | null>(cachedAdapter);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    createAdapter()
      .then((db) => {
        if (!cancelled) setAdapter(db);
      })
      .catch((err) => {
        if (!cancelled) setError(err as Error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
        <p className="text-sm text-red-400 font-semibold">Local database failed to initialize.</p>
        <pre className="mt-2 text-xs text-muted-foreground max-w-md text-center whitespace-pre-wrap">
          {error.message}
        </pre>
      </div>
    );
  }

  if (!adapter) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DatabaseContext.Provider value={adapter}>{children}</DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseAdapter {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return ctx;
}

/**
 * Best-effort access to the database adapter from non-React contexts
 * (e.g. the sync worker singleton). Returns null if the adapter has not
 * yet been initialised by the React tree.
 */
export function getDatabaseAdapter(): DatabaseAdapter | null {
  return cachedAdapter;
}