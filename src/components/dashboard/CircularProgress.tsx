/**
 * CircularProgress — SVG ring gauge for dashboard KPI visualization.
 *
 * Used in SKU Capacity and other percentage-based metrics.
 * Fully theme-aware: track is neutral-transparent, progress uses
 * an explicit hex color that works in both light and dark modes.
 */

import { cn } from "@/lib/utils";

interface CircularProgressProps {
  /** 0–100 percentage value */
  value: number;
  /** Primary label shown below the ring */
  label: string;
  /** Secondary label (smaller, muted) */
  sublabel?: string;
  /** Hex color for the progress arc */
  color: string;
  /** Ring size in px (default 80) */
  size?: number;
  /** Stroke width (default 7) */
  strokeWidth?: number;
  /** Show percentage text in the center */
  showPercent?: boolean;
  className?: string;
}

export function CircularProgress({
  value,
  label,
  sublabel,
  color,
  size = 80,
  strokeWidth = 7,
  showPercent = true,
  className,
}: CircularProgressProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Ring */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track (neutral, semi-transparent) */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(128,128,128,0.18)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>

        {/* Center text */}
        {showPercent && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color }}
            >
              {clamped}%
            </span>
          </div>
        )}
      </div>

      {/* Labels */}
      <div className="text-center leading-tight">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

// ─── Legend dot ───────────────────────────────────────────────────────────────

interface LegendDotProps {
  color: string;
  label: string;
}

export function LegendDot({ color, label }: LegendDotProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
