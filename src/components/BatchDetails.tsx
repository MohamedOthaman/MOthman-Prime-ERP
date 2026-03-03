import { type Batch } from "@/data/stockData";
import { ExpiryIndicator } from "./ExpiryIndicator";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function BatchDetails({ batches }: { batches: Batch[] }) {
  return (
    <div className="bg-muted/40 border-t border-border">
      <div className="px-4 py-2 grid grid-cols-[1fr_60px_90px_90px_50px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span>Batch</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Prod</span>
        <span className="text-right">Exp</span>
        <span className="text-right">D.Left</span>
      </div>
      {batches
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .map((batch) => (
          <div
            key={batch.batchNo}
            className="px-4 py-1.5 grid grid-cols-[1fr_60px_90px_90px_50px] gap-2 text-sm border-t border-border/50 items-center"
          >
            <span className="font-mono text-xs text-accent-foreground">{batch.batchNo}</span>
            <span className="text-right font-mono text-xs">{batch.qty} {batch.unit}</span>
            <span className="text-right text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(batch.productionDate)}
            </span>
            <span className="text-right text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(batch.expiryDate)}
            </span>
            <span className="text-right">
              <ExpiryIndicator days={batch.daysLeft} />
            </span>
          </div>
        ))}
    </div>
  );
}
