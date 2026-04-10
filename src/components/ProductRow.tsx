import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Product } from "@/data/stockData";
import { StorageBadge } from "./StorageBadge";
import { BatchDetails } from "./BatchDetails";
import { StockStatusBadge } from "./StockStatusBadge";

function formatQuantity(product: Product) {
  if (product.totalQty.length === 0) {
    return product.stockUnit ? `0 ${product.stockUnit}` : "0";
  }

  return product.totalQty.map((qty) => `${qty.amount} ${qty.unit}`).join(", ");
}

function formatDaysLeft(days: number) {
  if (days >= 999) return "";
  if (days < 0) return "EXP";
  return `${days}D`;
}

function getDaysClassName(days: number) {
  if (days < 0) return "text-destructive";
  if (days <= 14) return "text-destructive";
  if (days <= 30) return "text-warning";
  if (days <= 60) return "text-storage-chilled";
  return "text-muted-foreground";
}

export function ProductRow({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);

  const fefoBatchNo = useMemo(
    () =>
      [...product.batches]
        .filter((batch) => (batch.remainingQty ?? batch.qty) > 0)
        .sort((left, right) => {
          if (left.expiryDate === right.expiryDate) {
            return left.batchNo.localeCompare(right.batchNo);
          }
          if (!left.expiryDate) return 1;
          if (!right.expiryDate) return -1;
          return left.expiryDate.localeCompare(right.expiryDate);
        })[0]?.batchNo,
    [product.batches]
  );

  const daysLeftText = formatDaysLeft(product.nearestExpiryDays);

  return (
    <div className="border-b border-border/80 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-row-hover"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <span className="w-16 shrink-0 font-mono text-xs font-semibold text-primary">
          {product.code}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{product.name}</span>
          <StockStatusBadge status={product.stockStatus || "out_of_stock"} />
        </span>

        <span className="w-28 shrink-0 text-right font-mono text-xs font-semibold text-secondary-foreground">
          {formatQuantity(product)}
        </span>

        <span
          className={`w-14 shrink-0 text-right font-mono text-xs font-semibold ${getDaysClassName(
            product.nearestExpiryDays
          )}`}
        >
          {daysLeftText}
        </span>

        <span className="shrink-0">
          <StorageBadge type={product.storageType} />
        </span>
      </button>

      {expanded && <BatchDetails batches={product.batches} fefoBatchNo={fefoBatchNo} />}
    </div>
  );
}
