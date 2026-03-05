import { Badge } from "@/components/ui/badge";

export function ExpiryIndicator({ days }: { days: number }) {
  if (days < 0) {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
        Expired
      </Badge>
    );
  }

  let colorClass = "text-muted-foreground";
  if (days === 0) colorClass = "text-destructive font-bold";
  else if (days <= 14) colorClass = "text-destructive font-bold";
  else if (days <= 30) colorClass = "text-warning font-semibold";
  else if (days <= 60) colorClass = "text-storage-chilled";

  return (
    <span className={`font-mono text-sm ${colorClass}`}>
      {days}d
    </span>
  );
}
