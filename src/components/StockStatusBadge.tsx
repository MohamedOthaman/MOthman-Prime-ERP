import { Badge } from "@/components/ui/badge";
import { type StockStatus } from "@/data/stockData";

const STATUS_LABELS: Record<StockStatus, string> = {
  healthy: "Healthy",
  near_expiry: "Near Exp",
  expired: "Expired",
  out_of_stock: "Out",
};

const STATUS_CLASSES: Record<StockStatus, string> = {
  healthy: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  near_expiry: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  expired: "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300",
  out_of_stock: "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <Badge
      variant="outline"
      className={`h-5 justify-center whitespace-nowrap rounded px-1.5 text-[10px] font-semibold ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}
