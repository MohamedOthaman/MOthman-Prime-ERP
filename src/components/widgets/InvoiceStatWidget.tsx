import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface InvoiceStatWidgetProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  /** Tailwind text-color class, e.g. "text-amber-400" */
  color?: string;
  /** Navigate to this path on click */
  href?: string;
  /** Optional sub-label shown below value */
  sub?: string;
}

export function InvoiceStatWidget({
  label,
  value,
  icon: Icon,
  color = "text-primary",
  href,
  sub,
}: InvoiceStatWidgetProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={href ? () => navigate(href) : undefined}
      className={`flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left w-full transition ${
        href
          ? "hover:bg-muted/20 active:scale-[0.97] cursor-pointer"
          : "cursor-default"
      }`}
    >
      <Icon className={`w-4 h-4 ${color} mb-0.5`} />
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
    </button>
  );
}
