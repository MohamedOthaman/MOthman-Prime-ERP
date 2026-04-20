/**
 * BrandManagerDashboard — dashboard for brand_manager role.
 *
 * Focus: SKU portfolio by brand, stock health, near-expiry alerts.
 * Reads from inventory_product_stock_summary view (Phase I).
 */

import { useEffect, useState } from "react";
import {
  Tag,
  Package,
  AlertTriangle,
  BarChart3,
  ThermometerSnowflake,
  Flame,
  Wind,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  DashboardShell,
  WelcomeBar,
  KpiGrid,
  SectionCard,
  ActionGrid,
  FeedRow,
  EmptyState,
  LoadingRows,
  type KpiItem,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandSku {
  brand: string;
  count: number;
  available: number;
  nearExpiry: number;
}

interface DashboardData {
  totalSkus: number;
  zeroStock: number;
  nearExpiry: number;
  brandBreakdown: BrandSku[];
  storageBreakdown: { type: string; count: number }[];
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useBrandData() {
  const [data, setData]     = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

        const { data: rows } = await (supabase as any)
          .from("inventory_product_stock_summary")
          .select("product_id, name_en, brand, storage_type, available_quantity, nearest_expiry, batch_count");

        const products = (rows ?? []) as any[];

        const totalSkus  = products.length;
        const zeroStock  = products.filter(p => (p.available_quantity ?? 0) <= 0).length;
        const nearExpiry = products.filter(
          p => p.nearest_expiry && p.nearest_expiry <= in30 && (p.available_quantity ?? 0) > 0
        ).length;

        // Brand breakdown
        const brandMap: Record<string, BrandSku> = {};
        for (const p of products) {
          const b = p.brand ?? "Unknown";
          if (!brandMap[b]) brandMap[b] = { brand: b, count: 0, available: 0, nearExpiry: 0 };
          brandMap[b].count++;
          brandMap[b].available += (p.available_quantity ?? 0);
          if (p.nearest_expiry && p.nearest_expiry <= in30) brandMap[b].nearExpiry++;
        }
        const brandBreakdown = Object.values(brandMap).sort((a, b) => b.count - a.count).slice(0, 10);

        // Storage breakdown
        const storageMap: Record<string, number> = {};
        for (const p of products) {
          const s = p.storage_type ?? "Other";
          storageMap[s] = (storageMap[s] ?? 0) + 1;
        }
        const storageBreakdown = Object.entries(storageMap).map(([type, count]) => ({ type, count }));

        setData({ totalSkus, zeroStock, nearExpiry, brandBreakdown, storageBreakdown });
      } catch {
        // graceful degradation — show empty state
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return { data, loading };
}

// ─── Storage icons ────────────────────────────────────────────────────────────

const STORAGE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Frozen:  ThermometerSnowflake,
  Chilled: Wind,
  Dry:     Flame,
};

const STORAGE_COLOR: Record<string, string> = {
  Frozen:  "text-cyan-400",
  Chilled: "text-blue-400",
  Dry:     "text-amber-400",
};

// ─── Quick actions ────────────────────────────────────────────────────────────

const ACTIONS: ActionItem[] = [
  {
    label: "Products",
    path: "/products",
    icon: Package,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "Full product catalog",
  },
  {
    label: "Stock",
    path: "/stock",
    icon: Eye,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "Inventory overview",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: BarChart3,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    description: "Business reports",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BrandManagerDashboard() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { data, loading } = useBrandData();

  const fullName = user?.user_metadata?.full_name as string | undefined;

  const kpiItems: KpiItem[] = [
    {
      label: "Total SKUs",
      value: loading ? "—" : (data?.totalSkus ?? 0),
      icon: Package,
      color: "text-emerald-400",
      bg: "bg-emerald-500/8",
      border: "border-emerald-500/20",
      loading,
    },
    {
      label: "Out of Stock",
      value: loading ? "—" : (data?.zeroStock ?? 0),
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/8",
      border: "border-red-500/20",
      loading,
      trend: (data?.zeroStock ?? 0) > 0 ? "down" : "neutral",
    },
    {
      label: "Near Expiry (30d)",
      value: loading ? "—" : (data?.nearExpiry ?? 0),
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "bg-amber-500/8",
      border: "border-amber-500/20",
      loading,
      trend: (data?.nearExpiry ?? 0) > 0 ? "down" : "neutral",
    },
    {
      label: "Brands Active",
      value: loading ? "—" : (data?.brandBreakdown.length ?? 0),
      icon: Tag,
      color: "text-rose-400",
      bg: "bg-rose-500/8",
      border: "border-rose-500/20",
      loading,
    },
  ];

  return (
    <DashboardShell
      icon={Tag}
      title="Brand Manager"
      subtitle="SKU portfolio & stock health"
      accent="rose"
    >
      <WelcomeBar name={fullName} roleLabel="Brand Manager" accent="rose" />

      <KpiGrid items={kpiItems} />

      {/* Storage type breakdown */}
      <SectionCard title="Storage Type Distribution" icon={ThermometerSnowflake} iconClass="text-cyan-400">
        {loading ? <LoadingRows rows={3} /> : (
          <div className="grid grid-cols-3 gap-3">
            {(data?.storageBreakdown ?? []).map(({ type, count }) => {
              const Icon  = STORAGE_ICON[type]  ?? Package;
              const color = STORAGE_COLOR[type] ?? "text-muted-foreground";
              return (
                <div key={type} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                  <p className="text-lg font-bold text-foreground">{count}</p>
                  <p className="text-[10px] text-muted-foreground">{type}</p>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Brand breakdown */}
      <SectionCard
        title="SKU Count by Brand"
        icon={Tag}
        iconClass="text-rose-400"
        action={
          <button
            onClick={() => navigate("/products")}
            className="text-[10px] text-primary font-medium hover:underline"
          >
            View all →
          </button>
        }
      >
        {loading ? <LoadingRows rows={5} /> : (
          data?.brandBreakdown.length === 0
            ? <EmptyState icon={Package} message="No product data" sub="Import products to see brand breakdown" />
            : (
              <div className="space-y-1">
                {data!.brandBreakdown.map((b) => (
                  <FeedRow
                    key={b.brand}
                    dot="bg-rose-400"
                    middle={
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{b.brand}</span>
                        {b.nearExpiry > 0 && (
                          <span className="text-[9px] font-semibold rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/20 shrink-0">
                            {b.nearExpiry} near expiry
                          </span>
                        )}
                      </div>
                    }
                    right={
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{b.count}</p>
                        <p className="text-[10px] text-muted-foreground">SKUs</p>
                      </div>
                    }
                  />
                ))}
              </div>
            )
        )}
      </SectionCard>

      {/* Quick actions */}
      <SectionCard title="Quick Actions" icon={BarChart3} iconClass="text-muted-foreground">
        <ActionGrid actions={ACTIONS} onNavigate={navigate} cols={3} title="" />
      </SectionCard>
    </DashboardShell>
  );
}
