import { createContext, useContext, type ReactNode } from "react";
import { useNetworkStatus, type NetworkStatus } from "./useNetworkStatus";

const OfflineContext = createContext<NetworkStatus | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const status = useNetworkStatus();
  return (
    <OfflineContext.Provider value={status}>{children}</OfflineContext.Provider>
  );
}

export function useOfflineStatus(): NetworkStatus {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOfflineStatus must be used within an OfflineProvider");
  }
  return ctx;
}
