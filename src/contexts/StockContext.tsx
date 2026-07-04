import { createContext, useContext, ReactNode } from "react";
import { useStock } from "@/features/reports/hooks/useStock";

type StockContextType = ReturnType<typeof useStock>;

const StockContext = createContext<StockContextType | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const stockHook = useStock();
  return <StockContext.Provider value={stockHook}>{children}</StockContext.Provider>;
}

export function useStockContext() {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStockContext must be inside StockProvider");
  return ctx;
}
