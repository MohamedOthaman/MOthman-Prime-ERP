export function ExpiryIndicator({ days }: { days: number }) {
  const displayDays = Math.max(0, days);
  let colorClass = "text-muted-foreground";
  if (displayDays === 0) colorClass = "text-destructive font-bold";
  else if (displayDays <= 14) colorClass = "text-destructive font-bold";
  else if (displayDays <= 30) colorClass = "text-warning font-semibold";
  else if (displayDays <= 60) colorClass = "text-storage-chilled";

  return (
    <span className={`font-mono text-sm ${colorClass}`}>
      {displayDays}d
    </span>
  );
}
