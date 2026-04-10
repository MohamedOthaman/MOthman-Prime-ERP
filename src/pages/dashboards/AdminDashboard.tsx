import { useEffect, useState } from "react";
import {
  Users,
  Package,
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  Shield,
  UserPlus,
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Bell,
  Boxes,
  Eye,
  LayoutDashboard,
  Building2,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { getRecentAuditLogs, type AuditLogRow } from "@/services/auditService";
import { AlertsPanel } from "@/components/notifications/AlertsPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byTier: Record<string, number>;
  byRole: Record<string, number>;
}

// ─── Tier mapping for the role (matches usePermissions) ──────────────────────

const TIER_MAP: Record<string, string> = {
  owner: "owner",
  ceo: "executive", gm: "executive",
  admin: "admin", ops_manager: "admin",
  sales_manager: "manager", purchase_manager: "manager", brand_manager: "manager",
  warehouse_manager: "manager", inventory_controller: "manager",
  salesman: "user", sales: "user", accountant: "user", accounting: "user",
  invoice_team: "user", inventory: "user", warehouse: "user", cashier: "user",
  secretary: "user", purchase: "user", hr: "user", qc: "user", read_only: "user",
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  executive: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  admin: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  manager: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  user: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};



const quickActions = [
  { label: "User Management", path: "/admin/users",     icon: Users,         color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  { label: "System Settings", path: "/admin/settings",  icon: Settings,      color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-500/20"   },
  { label: "Stock Overview",  path: "/stock",            icon: Package,       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { label: "Reports",         path: "/reports",          icon: BarChart3,     color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
  { label: "GRN / Receiving", path: "/grn",              icon: ClipboardList, color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  { label: "Products",        path: "/products",         icon: Boxes,         color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20"    },
  { label: "Import / Export", path: "/import-export",    icon: FileSpreadsheet, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { role, tier, isOwner } = usePermissions();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<AuditLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // ── Load user statistics from profiles table ───────────────────────────

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("role, is_active");

      if (error || !data) {
        console.error("Failed to load user stats:", error);
        setStatsLoading(false);
        return;
      }

      const rows = data as Array<{ role: string; is_active: boolean }>;
      const stats: UserStats = {
        total: rows.length,
        active: rows.filter((r) => r.is_active).length,
        inactive: rows.filter((r) => !r.is_active).length,
        byTier: {},
        byRole: {},
      };

      rows.forEach((row) => {
        const tier = TIER_MAP[row.role] ?? "user";
        stats.byTier[tier] = (stats.byTier[tier] ?? 0) + 1;
        stats.byRole[row.role] = (stats.byRole[row.role] ?? 0) + 1;
      });

      setUserStats(stats);
      setStatsLoading(false);
    }

    void loadStats();
  }, []);

  // ── Load recent audit logs ─────────────────────────────────────────────

  useEffect(() => {
    setLogsLoading(true);
    getRecentAuditLogs(15).then((data) => {
      setRecentLogs(data);
      setLogsLoading(false);
    });
  }, []);

  const formatLogTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                Admin Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">{role} · {tier} tier</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => navigate("/admin/users")}
                className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Manage Users
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 space-y-5">
        {/* ── User KPIs (live data) ───────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3.5">
            <Users className="w-5 h-5 text-blue-400 mb-2" />
            <p className="text-xl font-bold text-foreground">
              {statsLoading ? "..." : userStats?.total ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Total Users</p>
            <p className="text-[10px] text-muted-foreground/70">from profiles table</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5">
            <Activity className="w-5 h-5 text-emerald-400 mb-2" />
            <p className="text-xl font-bold text-foreground">
              {statsLoading ? "..." : userStats?.active ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Active Users</p>
            <p className="text-[10px] text-muted-foreground/70">is_active = true</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5">
            <AlertTriangle className="w-5 h-5 text-red-400 mb-2" />
            <p className="text-xl font-bold text-foreground">
              {statsLoading ? "..." : userStats?.inactive ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Inactive Users</p>
            <p className="text-[10px] text-muted-foreground/70">disabled accounts</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5">
            <Bell className="w-5 h-5 text-amber-400 mb-2" />
            <p className="text-xl font-bold text-foreground">0</p>
            <p className="text-xs text-muted-foreground">System Alerts</p>
            <p className="text-[10px] text-muted-foreground/70">all clear</p>
          </div>
        </div>

        {/* ── Two-column: Role Distribution + Activity ─────── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Role Distribution (live data) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-foreground">Role Distribution</h2>
              {!statsLoading && userStats && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {Object.keys(userStats.byRole).length} roles
                </span>
              )}
            </div>
            {statsLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(userStats?.byTier ?? {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([tierName, count]) => {
                    const colors = TIER_COLORS[tierName] ?? TIER_COLORS.user;
                    const pct = userStats ? Math.round((count / userStats.total) * 100) : 0;
                    return (
                      <div key={tierName} className="flex items-center gap-2">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${colors.bg} ${colors.text} ${colors.border}`}>
                          {tierName}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${colors.bg.replace("/10", "/40")}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-foreground w-6 text-right">{count}</span>
                      </div>
                    );
                  })}

                {/* Top roles breakdown */}
                <div className="mt-3 pt-2 border-t border-border space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Top roles</p>
                  {Object.entries(userStats?.byRole ?? {})
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([roleName, count]) => (
                      <div key={roleName} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex-1 capitalize">
                          {roleName.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-mono text-foreground">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity — real audit logs */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
              {!logsLoading && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {recentLogs.length} entries
                </span>
              )}
            </div>
            {logsLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5" />
                No activity recorded yet
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2"
                  >
                    <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate capitalize">
                        {log.entity_type}: {log.action.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {log.metadata?.user_email || log.performed_by?.slice(0, 8) || "—"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatLogTime(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Alerts Panel (derived) ────────────────────────────── */}
        <AlertsPanel />

        {/* ── Owner / Executive power tools ─────────────────── */}
        {isOwner && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Owner Tools
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate("/admin/preview-as")}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 font-medium hover:bg-amber-500/20 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                View as User
              </button>
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground cursor-not-allowed"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Visual Dashboard Builder
                <span className="text-[9px] bg-muted rounded px-1 py-0.5 ml-1">Coming Soon</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Quick Actions ──────────────────────────────────── */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className={`text-left rounded-xl border ${action.border} ${action.bg} p-4 hover:opacity-80 transition-all active:scale-[0.98]`}
                >
                  <Icon className={`w-5 h-5 ${action.color} mb-2`} />
                  <h3 className="text-sm font-semibold text-foreground">{action.label}</h3>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
