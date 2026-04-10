import { type Batch } from "@/data/stockData";

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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

export function BatchDetails({
  batches,
  fefoBatchNo,
}: {
  batches: Batch[];
  fefoBatchNo?: string;
}) {
  const sortedBatches = [...batches]
    .filter((batch) => (batch.remainingQty ?? batch.qty) > 0)
    .sort((left, right) => {
      if (left.expiryDate === right.expiryDate) {
        return left.batchNo.localeCompare(right.batchNo);
      }
      if (!left.expiryDate) return 1;
      if (!right.expiryDate) return -1;
      return left.expiryDate.localeCompare(right.expiryDate);
    });

  if (sortedBatches.length === 0) {
    return (
      <div className="border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        No active batches available for this product.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-muted/30">
      <div className="grid grid-cols-[minmax(130px,1.2fr)_84px_92px_92px_60px_minmax(100px,1fr)] gap-2 px-10 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>Batch</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Prod</span>
        <span className="text-right">Exp</span>
        <span className="text-right">D.Left</span>
        <span className="text-right">Ref</span>
      </div>

      {sortedBatches.map((batch) => (
        <div
          key={`${batch.batchNo}-${batch.expiryDate}-${batch.referenceNo}`}
          className="grid grid-cols-[minmax(130px,1.2fr)_84px_92px_92px_60px_minmax(100px,1fr)] items-center gap-2 border-t border-border/50 px-10 py-1.5 text-sm"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-xs text-accent-foreground">{batch.batchNo}</span>
            {fefoBatchNo === batch.batchNo ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                FEFO
              </span>
            ) : null}
          </span>

          <span className="text-right font-mono text-xs">
            {(batch.remainingQty ?? batch.qty)} {batch.unit}
          </span>

          <span className="whitespace-nowrap text-right text-xs text-muted-foreground">
            {formatDate(batch.productionDate)}
          </span>

          <span className="whitespace-nowrap text-right text-xs text-muted-foreground">
            {formatDate(batch.expiryDate)}
          </span>

          <span className={`text-right font-mono text-xs font-semibold ${getDaysClassName(batch.daysLeft)}`}>
            {formatDaysLeft(batch.daysLeft)}
          </span>

          <span className="truncate text-right text-xs text-muted-foreground">
            {batch.referenceNo || ""}
          </span>
        </div>
      ))}
    </div>
  );
}
