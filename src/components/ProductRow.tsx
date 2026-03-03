import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type Product } from "@/data/stockData";
import { StorageBadge } from "./StorageBadge";
import { ExpiryIndicator } from "./ExpiryIndicator";
import { BatchDetails } from "./BatchDetails";

export function ProductRow({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);

  const qtyString = product.totalQty.map(q => `${q.amount} ${q.unit}`).join(", ");

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 hover:bg-row-hover transition-colors flex items-center gap-2 min-h-[44px]"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}

        <span className="font-mono text-xs text-primary font-semibold w-16 shrink-0">
          {product.code}
        </span>

        <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
          {product.name}
        </span>

        <span className="font-mono text-sm text-secondary-foreground shrink-0 w-24 text-right">
          {qtyString}
        </span>

        <span className="shrink-0 w-12 text-right">
          <ExpiryIndicator days={product.nearestExpiryDays} />
        </span>

        <span className="shrink-0">
          <StorageBadge type={product.storageType} />
        </span>
      </button>

      {expanded && <BatchDetails batches={product.batches} />}
    </div>
  );
}
