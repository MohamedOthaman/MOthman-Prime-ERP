import { type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient } from "@/lib/queryClient";
import { queryPersister, shouldPersistQuery } from "./persister";

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Wraps the app with a TanStack Query client whose reference-data queries
 * are persisted to IndexedDB so the app can render with cached lookups
 * even on a cold start without network.
 */
export function PersistGate({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: ONE_DAY,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && shouldPersistQuery(query.queryKey),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
