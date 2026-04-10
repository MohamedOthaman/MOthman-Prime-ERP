/**
 * StatusBadge — renders a color-coded status pill using the workflow config.
 * Supports both new and legacy status strings via normalizeStatus.
 */
import { getStatusConfig } from "@/config/workflowConfig";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, size = "sm", className = "" }: StatusBadgeProps) {
  const config = getStatusConfig(status);

  const sizeClass =
    size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold uppercase tracking-[0.08em] ${config.badgeClass} ${sizeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.shortLabel}
    </span>
  );
}
