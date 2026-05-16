interface Props {
  confidence: number;
}

export function ConfidenceBadge({ confidence }: Props) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10" :
    pct >= 60 ? "text-amber-500 border-amber-500/30 bg-amber-500/10" :
    "text-destructive border-destructive/30 bg-destructive/10";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      {pct}%
    </span>
  );
}
