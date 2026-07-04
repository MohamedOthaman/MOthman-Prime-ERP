/**
 * ExecutiveDashboard — CEO / General Manager view.
 *
 * Layout mirrors the design reference: dense operational data arranged in
 * a clear hierarchy. Every section connects to real Supabase data.
 *
 * Sections:
 *  1. Unified glass hero (sticky, merged header + welcome)
 *  2. KPI strip (live counts)
 *  3. A  Stock Reports  |  B  SKU Capacity rings  |  C  Invoices & Returns
 *  4. D  Shipment Details                         |  E  Business Alerts
 *  5. F  Salesman Performance
 *  6. Quick Actions
 */

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Camera,
  Package,
  Truck,
  Users,
  FileText,
  Eye,
  ChevronRight,
  ThermometerSnowflake,
  Flame,
  Wind,
  BarChart3,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Bell,
  UserSquare2,
  Activity,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { CircularProgress, LegendDot } from "@/components/dashboard/CircularProgress";
import { StatusPill, EmptyState, LoadingRows } from "@/components/dashboard/DashboardShell";

// ─── Storage type color map ───────────────────────────────────────────────────

const STORAGE_COLORS: Record<string, { hex: string; label: string; icon: typeof Package }> = {
  Frozen: { hex: "#06b6d4", label: "Frozen",  icon: ThermometerSnowflake },
  Chilled: { hex: "#3b82f6", label: "Chilled", icon: Wind },
  Dry: { hex: "#f59e0b",    label: "Dry",     icon: Flame },
};

// ─── Avatar storage key ───────────────────────────────────────────────────────

const AVATAR_KEY = "exec_avatar_url";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(fullName?: string, email?: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email ?? "??").slice(0, 2).toUpperCase();
}

function getGreeting(t: (key: string, fallback: string) => string): string {
  const h = new Date().getHours();
  return h < 12 ? t("goodMorning", "Good Morning") : h < 17 ? t("goodAfternoon", "Good Afternoon") : t("goodEvening", "Good Evening");
}

function fmtToday(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface SkuDist {
  type: string;
  count: number;
  pct: number;
}

interface ExpiryStats {
  within30: number;
  within180: number;
  expired: number;
}

interface GrnRow {
  id: string;
  grn_no: string | null;
  supplier_name: string | null;
  status: string;
  created_at: string;
  transport_mode?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_no: string | null;
  customer_id: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
}

interface SalesmanPerf {
  id: string;
  name: string;
  code: string | null;
  customerCount: number;
  pct: number;
}

interface DashboardData {
  skuDist: SkuDist[];
  totalSkus: number;
  activeSkus: number;
  expiryStats: ExpiryStats;
  grns: GrnRow[];
  grnPending: number;
  grnApproved: number;
  invoices: InvoiceRow[];
  invoiceToday: number;
  customerCount: number;
  salesmen: SalesmanPerf[];
  userCount: number;
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useExecutiveData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const in30  = new Date(Date.now() + 30  * 86400000).toISOString().slice(0, 10);
        const in180 = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

        const [
          skuRes,
          grnRes,
          invRes,
          custRes,
          salesmanRes,
          custBySalesmanRes,
          userRes,
          expiredRes,
          exp30Res,
          exp180Res,
        ] = await Promise.allSettled([
          // 1. SKU distribution by storage type
          supabase
            .from("inventory_product_stock_summary")
            .select("storage_type")
            .gt("available_quantity", 0),

          // 2. Recent GRNs
          supabase
            .from("receiving_headers")
            .select("id, grn_no, supplier_name, status, created_at, transport_mode")
            .order("created_at", { ascending: false })
            .limit(12),

          // 3. Recent invoices
          supabase
            .from("sales_headers")
            .select("id, invoice_no, customer_id, total_amount, status, created_at")
            .order("created_at", { ascending: false })
            .limit(8),

          // 4. Customer count
          supabase
            .from("customers")
            .select("id", { count: "exact", head: true }),

          // 5. Salesmen list
          supabase
            .from("salesmen")
            .select("id, name, code")
            .eq("is_active", true)
            .limit(20),

          // 6. Customers per salesman
          supabase
            .from("customers")
            .select("salesman_id"),

          // 7. User count
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),

          // 8. Expired stock
          supabase
            .from("inventory_product_stock_summary")
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .lt("nearest_expiry", today),

          // 9. Expiring within 30 days
          supabase
            .from("inventory_product_stock_summary")
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .gte("nearest_expiry", today)
            .lte("nearest_expiry", in30),

          // 10. Expiring within 6 months
          supabase
            .from("inventory_product_stock_summary")
            .select("product_id", { count: "exact", head: true })
            .gt("available_quantity", 0)
            .gte("nearest_expiry", today)
            .lte("nearest_expiry", in180),
        ]);

        // ── Process SKU distribution ─────────────────────────────────
        const skuRaw =
          skuRes.status === "fulfilled" ? (skuRes.value?.data ?? []) : [];

        const typeCounts: Record<string, number> = {};
        for (const row of skuRaw as any[]) {
          const t = row.storage_type ?? "Other";
          typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        }
        const totalActive = skuRaw.length;
        const skuDist: SkuDist[] = Object.entries(typeCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([type, count]) => ({
            type,
            count,
            pct: totalActive > 0 ? Math.round((count / totalActive) * 100) : 0,
          }));

        // ── GRNs ────────────────────────────────────────────────────
        const grnsRaw =
          grnRes.status === "fulfilled" ? (grnRes.value?.data ?? []) : [];
        const grnPending = (grnsRaw as any[]).filter(
          (g) => g.status === "received" || g.status === "inspected"
        ).length;
        const grnApproved = (grnsRaw as any[]).filter(
          (g) => g.status === "approved"
        ).length;

        // ── Invoices ─────────────────────────────────────────────────
        const invoicesRaw =
          invRes.status === "fulfilled" ? (invRes.value?.data ?? []) : [];
        const invoiceToday = (invoicesRaw as any[]).filter((i: any) =>
          (i.created_at ?? "").startsWith(today)
        ).length;

        // ── Salesmen performance ─────────────────────────────────────
        const salesmenRaw =
          salesmanRes.status === "fulfilled"
            ? ((salesmanRes.value?.data ?? []) as any[])
            : [];
        const custBySalesmanRaw =
          custBySalesmanRes.status === "fulfilled"
            ? ((custBySalesmanRes.value?.data ?? []) as any[])
            : [];

        const custCountMap: Record<string, number> = {};
        for (const c of custBySalesmanRaw) {
          if (c.salesman_id) {
            custCountMap[c.salesman_id] = (custCountMap[c.salesman_id] ?? 0) + 1;
          }
        }
        const maxCust = Math.max(...Object.values(custCountMap), 1);

        const salesmen: SalesmanPerf[] = salesmenRaw.map((s: any) => ({
          id: s.id,
          name: s.name ?? "—",
          code: s.code ?? null,
          customerCount: custCountMap[s.id] ?? 0,
          pct: Math.round(((custCountMap[s.id] ?? 0) / maxCust) * 100),
        }));

        setData({
          skuDist,
          totalSkus: totalActive,
          activeSkus: totalActive,
          expiryStats: {
            within30:  exp30Res.status === "fulfilled" ? ((exp30Res.value as any)?.count ?? 0) : 0,
            within180: exp180Res.status === "fulfilled" ? ((exp180Res.value as any)?.count ?? 0) : 0,
            expired:   expiredRes.status === "fulfilled" ? ((expiredRes.value as any)?.count ?? 0) : 0,
          },
          grns: (grnsRaw as any[]) as GrnRow[],
          grnPending,
          grnApproved,
          invoices: (invoicesRaw as any[]) as InvoiceRow[],
          invoiceToday,
          customerCount:
            custRes.status === "fulfilled" ? ((custRes.value as any)?.count ?? 0) : 0,
          salesmen,
          userCount:
            userRes.status === "fulfilled" ? ((userRes.value as any)?.count ?? 0) : 0,
        });
      } catch (err) {
        console.warn("[executive] Data load error:", err);
      }
      setLoading(false);
    }
    void load();
  }, []);

  return { data, loading };
}

// ─── Alert generator ──────────────────────────────────────────────────────────

function deriveAlerts(data: DashboardData, t: (key: string, fallback: string, ...args: any[]) => string) {
  const alerts: Array<{
    id: string;
    type: "danger" | "warning" | "info";
    icon: typeof AlertTriangle;
    title: string;
    desc: string;
    path?: string;
  }> = [];

  if (data.expiryStats.expired > 0) {
    alerts.push({
      id: "expired",
      type: "danger",
      icon: XCircle,
      title: `${data.expiryStats.expired} ${t("skusExpired", "SKU(s) Expired")}`,
      desc: t("expiredStockDesc", "Stock with passed expiry date still recorded in inventory"),
      path: "/stock",
    });
  }

  if (data.expiryStats.within30 > 0) {
    alerts.push({
      id: "exp-30",
      type: "warning",
      icon: AlertTriangle,
      title: `${data.expiryStats.within30} ${t("skusExpiringMonth", "SKU(s) Expiring This Month")}`,
      desc: t("expiringMonthDesc", "Nearest expiry within 30 days — requires action"),
      path: "/stock",
    });
  }

  if (data.grnPending > 0) {
    alerts.push({
      id: "grn-pending",
      type: "warning",
      icon: Clock,
      title: `${data.grnPending} ${t("grnsPendingInspection", "GRN(s) Pending Inspection")}`,
      desc: t("grnsPendingDesc", "Received goods awaiting QC inspection or approval"),
      path: "/grn",
    });
  }

  if (data.expiryStats.within180 > data.expiryStats.within30) {
    const sixMonthOnly = data.expiryStats.within180 - data.expiryStats.within30;
    alerts.push({
      id: "exp-180",
      type: "info",
      icon: Bell,
      title: `${sixMonthOnly} ${t("skusExpiring6Months", "SKU(s) Expiring in 6 Months")}`,
      desc: t("expiring6MonthsDesc", "Plan stock rotation for these items"),
      path: "/stock",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      type: "info",
      icon: CheckCircle2,
      title: t("allSystemsNormal", "All Systems Normal"),
      desc: t("noCriticalAlerts", "No critical alerts at this time"),
    });
  }

  return alerts;
}

// ─── Executive Avatar sub-component ──────────────────────────────────────────

interface ExecutiveAvatarProps {
  initials: string;
  avatarUrl: string | null;
  onUpload: (url: string) => void;
}

function ExecutiveAvatar({ initials, avatarUrl, onUpload }: ExecutiveAvatarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (url) {
        localStorage.setItem(AVATAR_KEY, url);
        onUpload(url);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative group shrink-0">
      <div
        className="w-14 h-14 rounded-2xl ring-2 ring-amber-500/40 ring-offset-2 ring-offset-background overflow-hidden flex items-center justify-center cursor-pointer"
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        aria-label="Upload avatar"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <span className="text-lg font-bold text-amber-950">{initials}</span>
          </div>
        )}
        {/* Camera overlay on hover */}
        <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Camera className="w-5 h-5 text-white" />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { user } = useAuth();
  const { role } = usePermissions();
  const { data, loading } = useExecutiveData();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => localStorage.getItem(AVATAR_KEY));

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const initials = getInitials(fullName, user?.email);
  const firstName = fullName ? fullName.trim().split(/\s+/)[0] : "Marwan";
  const displayName = `Mr. ${firstName}`;
  const roleLabel = role === "ceo" ? t("roleCeo", "CEO") : role === "gm" ? t("roleGm", "General Manager") : role.replace(/_/g, " ");
  const greeting = getGreeting(t);
  const alerts = data ? deriveAlerts(data, t) : [];
  const isCeo = role === "ceo";

  // ── SKU capacity rings — top 3 storage types ──
  const capacityRings = (() => {
    if (!data || data.skuDist.length === 0) {
      return [
        { type: "Frozen",  pct: 0, label: "Frozen",  sublabel: "—",  color: STORAGE_COLORS.Frozen.hex },
        { type: "Dry",     pct: 0, label: "Dry",     sublabel: "—",  color: STORAGE_COLORS.Dry.hex },
        { type: "Chilled", pct: 0, label: "Chilled", sublabel: "—",  color: STORAGE_COLORS.Chilled.hex },
      ];
    }
    const byType: Record<string, number> = {};
    for (const d of data.skuDist) byType[d.type] = d.pct;

    return ["Frozen", "Dry", "Chilled"].map((t) => ({
      type: t,
      pct: byType[t] ?? 0,
      label: t,
      sublabel: `${(data.skuDist.find((d) => d.type === t)?.count ?? 0)} SKUs`,
      color: STORAGE_COLORS[t]?.hex ?? "#6b7280",
    }));
  })();

  return (
    <div className="min-h-screen bg-background pb-20">

      {/* ═══════════════════════════════════════════════════════════════
          UNIFIED GLASS HERO — sticky header + welcome merged
      ═══════════════════════════════════════════════════════════════ */}
      <div className="sticky top-11 z-40 bg-gradient-to-r from-amber-500/8 via-background/95 to-background/95 backdrop-blur-md border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Avatar */}
          <ExecutiveAvatar
            initials={initials}
            avatarUrl={avatarUrl}
            onUpload={setAvatarUrl}
          />

          {/* Identity block */}
          <div className="flex-1 min-w-0">
            {/* Page label */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400 font-medium leading-none">
                {t("executiveDashboard", "Executive Dashboard")} · {t("companyOverview", "Company Overview")}
              </span>
            </div>
            {/* Greeting + Name */}
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground leading-tight">{greeting},</span>
              <span className="text-base font-bold text-foreground leading-tight">{displayName}</span>
            </div>
            {/* Date */}
            <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{fmtToday()}</p>
          </div>

          {/* Right pills */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Live</span>
            </div>
            {/* Role pill */}
            <div className="hidden sm:flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">{roleLabel}</span>
            </div>
            {/* View As — hidden for CEO */}
            {!isCeo && (
              <button
                onClick={() => navigate("/admin/preview-as")}
                className="flex items-center gap-1.5 text-xs border border-amber-500/25 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-500/20 transition shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("viewAsUser", "View As")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-3 space-y-3">

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 2 — KPI strip
        ═══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {[
            {
              label: t("activeSkus", "Active SKUs"),
              value: loading ? "…" : (data?.activeSkus ?? "—"),
              icon: Package,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
              border: "border-emerald-500/20",
            },
            {
              label: t("grnPending", "GRN Pending"),
              value: loading ? "…" : (data?.grnPending ?? "—"),
              icon: Truck,
              color: "text-amber-400",
              bg: "bg-amber-500/10",
              border: "border-amber-500/20",
            },
            {
              label: t("customersNav", "Customers"),
              value: loading ? "…" : (data?.customerCount ?? "—"),
              icon: Users,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10",
              border: "border-cyan-500/20",
            },
            {
              label: t("grnsToday", "Invoices Today"),
              value: loading ? "…" : (data?.invoiceToday ?? "—"),
              icon: FileText,
              color: "text-violet-400",
              bg: "bg-violet-500/10",
              border: "border-violet-500/20",
            },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className={`rounded-xl border ${k.border} ${k.bg} p-3 flex items-center gap-3`}>
                <Icon className={`w-5 h-5 ${k.color} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-xl font-bold text-foreground leading-tight">{k.value}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 3 — Three-panel row: Reports | SKU Capacity | Invoices
        ═══════════════════════════════════════════════════════════════ */}
        <div className="grid md:grid-cols-3 gap-3">

          {/* ── A: Stock Reports ──────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">{t("stockReport", "Stock Reports")}</h2>
              <span className="ms-auto text-[10px] font-mono text-muted-foreground">
                {loading ? "…" : `${data?.activeSkus ?? 0} ${t("activeSkus", "active SKUs")}`}
              </span>
            </div>

            {[
              {
                label: t("sixMonthsExpiry", "6 Months Expiry"),
                sub: t("frozenChilledDry", "Dry / Frozen / Chilled"),
                count: data?.expiryStats.within180,
                color: data?.expiryStats.within180 ? "text-amber-400" : "text-muted-foreground",
                path: "/stock",
              },
              {
                label: t("stockOverview", "Stock Overview"),
                sub: t("detailsMovement", "Details & Movement"),
                count: data?.activeSkus,
                color: "text-emerald-400",
                path: "/stock",
              },
              {
                label: t("nearExpiryThisWeek", "Near Expiry / This Week"),
                sub: t("within30Days", "Expiring within 30 days"),
                count: data?.expiryStats.within30,
                color: data?.expiryStats.within30 ? "text-red-400" : "text-muted-foreground",
                path: "/stock",
              },
              {
                label: t("destroysDamages", "Destroys & Damages"),
                sub: t("expiredStockInventory", "Expired stock in inventory"),
                count: data?.expiryStats.expired,
                color: data?.expiryStats.expired ? "text-red-500" : "text-muted-foreground",
                path: "/stock",
              },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition text-left group"
              >
                <span className="text-muted-foreground group-hover:text-foreground transition text-sm">+</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
                {item.count != null && !loading && (
                  <span className={`text-xs font-bold shrink-0 ${item.color}`}>
                    {item.count}
                  </span>
                )}
                {loading && <div className="w-6 h-3 rounded bg-muted/50 animate-pulse shrink-0" />}
                <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>

          {/* ── B: SKU Capacity rings ─────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground">{t("skuDistribution", "SKU Distribution")}</h2>
            </div>

            {/* Three rings */}
            <div className="flex items-end justify-around gap-2">
              {capacityRings.map((ring) => (
                <CircularProgress
                  key={ring.type}
                  value={loading ? 0 : ring.pct}
                  label={ring.label}
                  sublabel={loading ? "…" : ring.sublabel}
                  color={ring.color}
                  size={66}
                  strokeWidth={6}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-center gap-4 flex-wrap">
              {(["Frozen", "Dry", "Chilled"] as const).map((t) => (
                <LegendDot
                  key={t}
                  color={STORAGE_COLORS[t].hex}
                  label={t}
                />
              ))}
            </div>

            {/* Total */}
            <div className="mt-2 text-center">
              <p className="text-[10px] text-muted-foreground">
                {loading ? t("loading", "Loading...") : `${data?.activeSkus ?? 0} ${t("totalActiveSkus", "total active SKUs in stock")}`}
              </p>
            </div>
          </div>

          {/* ── C: Invoice & Returns ──────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-3 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground">{t("latestInvoices", "Latest Invoices")}</h2>
              <button
                onClick={() => navigate("/invoice-entry")}
                className="ms-auto text-[10px] text-primary font-medium hover:underline"
              >
                {t("viewAll", "View all →")}
              </button>
            </div>

            {loading ? (
              <LoadingRows count={4} />
            ) : !data || data.invoices.length === 0 ? (
              <EmptyState icon={FileText} message={t("noInvoicesYet", "No invoices yet")} />
            ) : (
              <div className="space-y-1.5 flex-1">
                {data.invoices.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-1.5"
                  >
                    <div className="w-1 h-8 rounded-full bg-blue-400/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {inv.invoice_no ?? `INV ${inv.id.slice(0, 8)}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {inv.total_amount != null && (
                        <p className="text-xs font-bold text-foreground tabular-nums">
                          {Number(inv.total_amount).toLocaleString("en-AE", {
                            style: "currency", currency: "AED", maximumFractionDigits: 0,
                          })}
                        </p>
                      )}
                      {inv.status && <StatusPill status={inv.status} />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Returns placeholder */}
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground/50 text-center">
                {t("returnsModuleNextPhase", "Returns module connects in next phase")}
              </p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 4 — Shipment Details | Business Alerts
        ═══════════════════════════════════════════════════════════════ */}
        <div className="grid md:grid-cols-2 gap-3">

          {/* ── D: Shipment Details ───────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-foreground">{t("shipmentDetails", "Shipment Details")}</h2>
              <button
                onClick={() => navigate("/grn")}
                className="ms-auto text-[10px] text-primary font-medium hover:underline"
              >
                {t("viewAll", "View all →")}
              </button>
            </div>

            {loading ? (
              <LoadingRows count={5} />
            ) : !data || data.grns.length === 0 ? (
              <EmptyState icon={Truck} message={t("noShipmentsRecorded", "No shipments recorded")} />
            ) : (
              <>
                {/* Received group */}
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-1">
                    {t("received", "Received")}
                  </p>
                  <div className="space-y-1">
                    {data.grns
                      .filter((g) => g.status === "received" || g.status === "approved")
                      .slice(0, 3)
                      .map((grn) => (
                        <button
                          key={grn.id}
                          onClick={() => navigate(`/grn/${grn.id}`)}
                          className="w-full flex items-center gap-3 rounded-lg bg-muted/25 hover:bg-muted/40 px-3 py-1.5 transition text-left"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {grn.supplier_name ?? t("unknownSupplier", "Unknown Supplier")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {grn.transport_mode ?? t("shipment", "Shipment")} · {grn.grn_no ?? grn.id.slice(0, 8)}
                            </p>
                          </div>
                          <StatusPill status={grn.status} />
                        </button>
                      ))}
                  </div>
                </div>

                {/* In transit / pending */}
                {data.grns.filter((g) => g.status === "draft" || g.status === "inspected").length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest mb-1">
                      {t("inProgress", "In Progress")}
                    </p>
                    <div className="space-y-1">
                      {data.grns
                        .filter((g) => g.status === "draft" || g.status === "inspected")
                        .slice(0, 3)
                        .map((grn) => (
                          <button
                            key={grn.id}
                            onClick={() => navigate(`/grn/${grn.id}`)}
                            className="w-full flex items-center gap-3 rounded-lg bg-muted/25 hover:bg-muted/40 px-3 py-1.5 transition text-left"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {grn.supplier_name ?? t("unknownSupplier", "Unknown Supplier")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {grn.grn_no ?? grn.id.slice(0, 8)}
                              </p>
                            </div>
                            <StatusPill status={grn.status} />
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── E: Business Alerts ────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-foreground">{t("businessAlerts", "Alerts")}</h2>
              {!loading && alerts.filter((a) => a.type !== "info").length > 0 && (
                <span className="ms-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                  {alerts.filter((a) => a.type !== "info").length}
                </span>
              )}
            </div>

            {loading ? (
              <LoadingRows count={3} />
            ) : (
              <div className="space-y-1.5">
                {alerts.map((alert) => {
                  const Icon = alert.icon;
                  const cls =
                    alert.type === "danger"
                      ? "bg-red-500/8 border-red-500/20 text-red-400"
                      : alert.type === "warning"
                        ? "bg-amber-500/8 border-amber-500/20 text-amber-400"
                        : "bg-muted/30 border-border text-muted-foreground";

                  return (
                    <button
                      key={alert.id}
                      onClick={() => alert.path && navigate(alert.path)}
                      disabled={!alert.path}
                      className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2 transition ${cls} ${alert.path ? "hover:opacity-80" : "cursor-default"}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{alert.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{alert.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 5 — Salesman Performance
        ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <UserSquare2 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-foreground">{t("topSalesmen", "Sales Team")}</h2>
            <span className="text-[10px] text-muted-foreground ms-1">— {t("customerCoverage", "Customer coverage")}</span>
            <button
              onClick={() => navigate("/salesmen")}
              className="ms-auto text-[10px] text-primary font-medium hover:underline"
            >
              {t("manage", "Manage →")}
            </button>
          </div>

          {loading ? (
            <LoadingRows count={4} />
          ) : !data || data.salesmen.length === 0 ? (
            <EmptyState
              icon={UserSquare2}
              message={t("noActiveSalesmen", "No salesmen configured")}
              sub={t("addSalesmenTracking", "Add salesmen to see performance tracking")}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
              {data.salesmen.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-cyan-400">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {/* Name */}
                  <span className="text-xs font-medium text-foreground w-20 shrink-0 truncate">
                    {s.name}
                  </span>
                  {/* Bar */}
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all duration-700"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                  {/* Count */}
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-10 text-right">
                    {s.customerCount} {t("customersShort", "cust")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 6 — Quick Actions
        ═══════════════════════════════════════════════════════════════ */}
        <div>
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            {t("quickNav", "Quick Access")}
          </h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
            {[
              { label: t("reports", "Reports"),        path: "/reports",        icon: BarChart3,    color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
              { label: t("stockOverview", "Stock"),  path: "/stock",          icon: Package,      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
              { label: t("invoicesNav", "Invoices"), path: "/invoice-entry",  icon: TrendingUp,   color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
              { label: t("grnReceiving", "GRN"),     path: "/grn",            icon: ClipboardList, color: "text-amber-400", bg: "bg-amber-500/10",  border: "border-amber-500/20" },
              { label: t("customersNav", "Customers"), path: "/customers",    icon: Users,        color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/20" },
              { label: t("salesmenNav", "Salesmen"), path: "/salesmen",       icon: UserSquare2,  color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/20" },
            ].map(({ label, path, icon: Icon, color, bg, border }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border ${border} ${bg} py-2.5 px-2 hover:opacity-80 transition-all active:scale-[0.97]`}
              >
                <Icon className={`w-5 h-5 ${color}`} />
                <span className="text-[11px] font-medium text-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
