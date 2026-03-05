import { useMemo } from "react";
import { useStockContext } from "@/contexts/StockContext";

const MOVING_THRESHOLD_KEY = "moving_threshold";

export function getMovingThreshold(): number {
  try {
    const saved = localStorage.getItem(MOVING_THRESHOLD_KEY);
    if (saved) return Number(saved);
  } catch {}
  return 20;
}

export function setMovingThreshold(val: number) {
  localStorage.setItem(MOVING_THRESHOLD_KEY, String(val));
}

export function useProductMovingSpeed(productCode: string): "fast" | "slow" {
  const { invoices } = useStockContext();
  
  return useMemo(() => {
    const threshold = getMovingThreshold();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

    let totalSold = 0;
    for (const inv of invoices) {
      if (inv.date >= cutoff) {
        for (const item of inv.items) {
          if (item.productCode === productCode) {
            totalSold += item.qty;
          }
        }
      }
    }
    return totalSold >= threshold ? "fast" : "slow";
  }, [invoices, productCode]);
}

export function MovingBadge({ productCode }: { productCode: string }) {
  const speed = useProductMovingSpeed(productCode);
  
  return (
    <span className={`text-[10px] px-1 py-0 rounded font-semibold ${
      speed === "fast" 
        ? "bg-success-bg text-success" 
        : "bg-secondary text-muted-foreground"
    }`}>
      {speed === "fast" ? "⚡Fast" : "🐢Slow"}
    </span>
  );
}
