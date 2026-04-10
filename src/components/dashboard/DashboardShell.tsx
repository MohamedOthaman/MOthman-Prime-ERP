/**
 * DashboardShell — shared layout primitives used across all role dashboards.
 *
 * Exports:
 *   Layout:        DashboardShell, SectionCard, SectionHeader
 *   Data display:  KpiGrid, PipelineBar, FeedRow
 *   States:        LoadingRows, EmptyState, DashboardError
 *   Alerts:        AlertBanner, AlertGroup
 *   Actions:       ActionGrid
 *   Status:        StatusPill
 *   Welcome:       WelcomeBar
 *
 * Architecture note: These composable components form the foundation for the
 * future visual dashboard builder. Each component maps to a widget type in
 * widgetRegistry.ts — the builder will render these from persisted configs.
 */

import { type ReactNode, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

// ─── Accent color palette ─────────────────────────────────────────────────────

export const ACCENT = {
  amber: {
    iconBg: "bg-amber-500/10", iconBorder: "border-amber-500/20", iconText: "text-amber-400",
    cardBg: "bg-amber-500/8",  cardBorder: "border-amber-500/20", bar: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  blue: {
    iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/20", iconText: "text-blue-400",
    cardBg: "bg-blue-500/8",  cardBorder: "border-blue-500/20", bar: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  },
  emerald: {
    iconBg: "bg-emerald-500/10", iconBorder: "border-emerald-500/20", iconText: "text-emerald-400",
    cardBg: "bg-emerald-500/8",  cardBorder: "border-emerald-500/20", bar: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  violet: {
    iconBg: "bg-violet-500/10", iconBorder: "border-violet-500/20", iconText: "text-violet-400",
    cardBg: "bg-violet-500/8",  cardBorder: "border-violet-500/20", bar: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  },
  cyan: {
    iconBg: "bg-cyan-500/10", iconBorder: "border-cyan-500/20", iconText: "text-cyan-400",
    cardBg: "bg-cyan-500/8",  cardBorder: "border-cyan-500/20", bar: "bg-cyan-500",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  },
  rose: {
    iconBg: "bg-rose-500/10", iconBorder: "border-rose-500/20", iconText: "text-rose-400",
    cardBg: "bg-rose-500/8",  cardBorder: "border-rose-500/20", bar: "bg-rose-500",
    badge: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  },
  orange: {
    iconBg: "bg-orange-500/10", iconBorder: "border-orange-500/20", iconText: "text-orange-400",
    cardBg: "bg-orange-500/8",  cardBorder: "border-orange-500/20", bar: "bg-orange-500",
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  },
  sky: {
    iconBg: "bg-sky-500/10", iconBorder: "border-sky-500/20", iconText: "text-sky-400",
    cardBg: "bg-sky-500/8",  cardBorder: "border-sky-500/20", bar: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  },
  purple: {
    iconBg: "bg-purple-500/10", iconBorder: "border-purple-500/20", iconText: "text-purple-400",
    cardBg: "bg-purple-500/8",  cardBorder: "border-purple-500/20", bar: "bg-purple-500",
    badge: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  },
  teal: {
    iconBg: "bg-teal-500/10", iconBorder: "border-teal-500/20", iconText: "text-teal-400",
    cardBg: "bg-teal-500/8",  cardBorder: "border-teal-500/20", bar: "bg-teal-500",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/25",
  },
} as const;

export type AccentKey = keyof typeof ACCENT;

// ─── DashboardShell ───────────────────────────────────────────────────────────

interface DashboardShellProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: AccentKey;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  icon: Icon, title, subtitle, accent, headerAction, children,
}: DashboardShellProps) {
  const a = ACCENT[accent];
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <div className={cn("flex items-center justify-center w-9 h-9 rounded-xl border shrink-0", a.iconBg, a.iconBorder)}>
            <Icon className={cn("w-4 h-4", a.iconText)} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">{title}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
          </div>
          {headerAction}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-4 space-y-5">{children}</main>
    </div>
  );
}

// ─── WelcomeBar ───────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function WelcomeBar({
  name,
  roleLabel,
  accent = "blue",
}: {
  name?: string;
  roleLabel?: string;
  accent?: AccentKey;
}) {
  const a = ACCENT[accent];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  return (
    <div className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", a.cardBg, a.cardBorder)}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {getGreeting()}{name ? `, ${name.split(" ")[0]}` : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {today}{roleLabel ? ` · ${roleLabel}` : ""}
        </p>
      </div>
    </div>
  );
}

// ─── KpiGrid ─────────────────────────────────────────────────────────────────

export interface KpiItem {
  label: string;
  value: string | number;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}

export function KpiGrid({ items }: { items: KpiItem[] }) {
  const cols =
    items.length === 1 ? "grid-cols-1" :
    items.length === 2 ? "grid-cols-2" :
    items.length === 3 ? "grid-cols-3" :
    "grid-cols-2 md:grid-cols-4";

  return (
    <div className={cn("grid gap-3", cols)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className={cn("rounded-xl border p-3.5 flex flex-col gap-0.5", item.border, item.bg)}>
            <div className="flex items-center justify-between mb-1.5">
              <Icon className={cn("w-4 h-4", item.color)} />
              {item.trend === "up"   && <ArrowUpRight   className="w-3.5 h-3.5 text-emerald-400" />}
              {item.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />}
            </div>
            {item.loading ? (
              <div className="h-7 w-16 rounded bg-muted/50 animate-pulse" />
            ) : (
              <p className="text-xl font-bold text-foreground">{item.value}</p>
            )}
            <p className="text-xs text-muted-foreground">{item.label}</p>
            {item.sub && <p className="text-[10px] text-muted-foreground/65">{item.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── PipelineBar ─────────────────────────────────────────────────────────────
// Horizontal progress-bar breakdown used by invoice / GRN / returns pipelines

export interface PipelineRow {
  label: string;
  count: number;
  bar: string;   // Tailwind bg class, e.g. "bg-amber-500"
  text: string;  // Tailwind text class, e.g. "text-amber-400"
}

export function PipelineBar({
  rows,
  total,
  loading = false,
  labelWidth = "w-20",
}: {
  rows: PipelineRow[];
  total: number;
  loading?: boolean;
  labelWidth?: string;
}) {
  const max = Math.max(total, 1);
  return (
    <div className="space-y-2">
      {rows.map(({ label, count, bar, text }) => {
        const pct = Math.round((count / max) * 100);
        return (
          <div key={label} className="flex items-center gap-2.5">
            <span className={cn("text-xs font-medium shrink-0", labelWidth, text)}>{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
              {loading ? "…" : count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── AlertBanner ─────────────────────────────────────────────────────────────
// Standardized operational alert / attention block.
// severity: danger=red, warning=amber, info=blue, success=emerald
// If onClick is provided, renders as a button; otherwise as a div.

export type AlertSeverity = "danger" | "warning" | "info" | "success";

const ALERT_STYLES: Record<AlertSeverity, {
  bg: string; border: string; text: string;
  defaultIcon: ComponentType<{ className?: string }>;
}> = {
  danger:  { bg: "bg-red-500/8",    border: "border-red-500/20",    text: "text-red-400",    defaultIcon: XCircle },
  warning: { bg: "bg-amber-500/8",  border: "border-amber-500/20",  text: "text-amber-400",  defaultIcon: AlertTriangle },
  info:    { bg: "bg-blue-500/8",   border: "border-blue-500/20",   text: "text-blue-400",   defaultIcon: Info },
  success: { bg: "bg-emerald-500/8",border: "border-emerald-500/20",text: "text-emerald-400",defaultIcon: CheckCircle2 },
};

export interface AlertBannerProps {
  severity: AlertSeverity;
  message: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export function AlertBanner({ severity, message, icon: CustomIcon, onClick }: AlertBannerProps) {
  const s = ALERT_STYLES[severity];
  const Icon = CustomIcon ?? s.defaultIcon;
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { onClick } : {})}
      className={cn(
        "flex items-center gap-2 w-full rounded-lg border px-3 py-2.5",
        s.bg, s.border,
        onClick && "hover:opacity-80 transition text-left cursor-pointer",
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", s.text)} />
      <p className={cn("text-xs font-medium flex-1", s.text)}>
        {message}{onClick ? " →" : ""}
      </p>
    </Wrapper>
  );
}

// ─── AlertGroup ───────────────────────────────────────────────────────────────
// Wraps a set of AlertBanners with consistent spacing

export function AlertGroup({ children, show = true }: { children: ReactNode; show?: boolean }) {
  if (!show) return null;
  return <div className="space-y-2">{children}</div>;
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

export interface ActionItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  description?: string;
}

interface SectionCardProps {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  iconClass?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title, icon: Icon, iconClass, action, children, className,
}: SectionCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className={cn("w-4 h-4", iconClass ?? "text-muted-foreground")} />}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── ActionGrid ──────────────────────────────────────────────────────────────

interface ActionGridProps {
  actions: ActionItem[];
  onNavigate: (path: string) => void;
  cols?: 2 | 3 | 4;
  title?: string;
}

export function ActionGrid({ actions, onNavigate, cols = 4, title = "Quick Actions" }: ActionGridProps) {
  const colClass =
    cols === 2 ? "grid-cols-2" :
    cols === 3 ? "grid-cols-2 md:grid-cols-3" :
    "grid-cols-2 md:grid-cols-4";
  return (
    <div>
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
        {title}
      </h2>
      <div className={cn("grid gap-3", colClass)}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.path}
              onClick={() => onNavigate(action.path)}
              className={cn(
                "text-left rounded-xl border p-3.5 hover:opacity-80 transition-all active:scale-[0.97]",
                action.border, action.bg,
              )}
            >
              <Icon className={cn("w-5 h-5 mb-2", action.color)} />
              <h3 className="text-sm font-semibold text-foreground">{action.label}</h3>
              {action.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{action.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── FeedRow ─────────────────────────────────────────────────────────────────

interface FeedRowProps {
  left?: ReactNode;
  middle: ReactNode;
  right?: ReactNode;
  dot?: string;
}

export function FeedRow({ left, middle, right, dot }: FeedRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
      {dot && <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />}
      {!dot && left && <div className="shrink-0">{left}</div>}
      <div className="flex-1 min-w-0">{middle}</div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon, message, sub,
}: {
  icon?: ComponentType<{ className?: string }>;
  message: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-7 gap-2">
      {Icon && <Icon className="w-7 h-7 text-muted-foreground/30" />}
      <p className="text-xs font-medium text-muted-foreground/60 text-center">{message}</p>
      {sub && <p className="text-[10px] text-muted-foreground/40 text-center">{sub}</p>}
    </div>
  );
}

// ─── DashboardError ──────────────────────────────────────────────────────────

export function DashboardError({
  message = "Failed to load data",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <AlertTriangle className="w-8 h-8 text-red-400/40" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <RefreshCw className="w-3 h-3" />
          Try again
        </button>
      )}
    </div>
  );
}

// ─── LoadingRows ─────────────────────────────────────────────────────────────

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}

// ─── StatusPill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  // Generic
  draft:                "bg-muted text-muted-foreground border-border",
  pending:              "bg-amber-500/15 text-amber-400 border-amber-500/25",
  approved:             "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  rejected:             "bg-red-500/15 text-red-400 border-red-500/25",
  cancelled:            "bg-red-500/15 text-red-400 border-red-500/25",
  // Invoice statuses
  ready:                "bg-amber-500/15 text-amber-400 border-amber-500/25",
  done:                 "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  received:             "bg-blue-500/15 text-blue-400 border-blue-500/25",
  returns:              "bg-violet-500/15 text-violet-400 border-violet-500/25",
  // GRN statuses
  inspected:            "bg-violet-500/15 text-violet-400 border-violet-500/25",
  completed:            "bg-teal-500/15 text-teal-400 border-teal-500/25",
  partial_hold:         "bg-orange-500/15 text-orange-400 border-orange-500/25",
  municipality_pending: "bg-sky-500/15 text-sky-400 border-sky-500/25",
};

export function StatusPill({ status }: { status: string }) {
  const cls = STATUS_PILL[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize", cls)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
