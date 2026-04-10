/**
 * OwnerDashboard — Owner / Super Admin control panel.
 *
 * Single unified control surface combining:
 *   • System KPIs             — live counts across all modules
 *   • Operational feeds       — GRNs, invoices, expiry alerts
 *   • Sales performance       — salesman revenue bars
 *   • User Control            — inline role/status/password management
 *   • Module Control          — feature-flag toggles (localStorage → DB-backed when ready)
 *
 * Intentionally does NOT use DashboardShell — this page has its own
 * sticky header and max-w-7xl layout since it's a control panel, not a
 * monitoring dashboard.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Crown,
  Shield,
  Users,
  Package,
  Truck,
  FileText,
  BarChart3,
  FileSpreadsheet,
  UserSquare2,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarX2,
  ThermometerSnowflake,
  Flame,
  Wind,
  RotateCcw,
  Save,
  Search,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Power,
  TrendingUp,
  Activity,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditService";
import { getAppUrl } from "@/config/appUrl";
import { SectionCard, StatusPill, EmptyState, LoadingRows } from "@/components/dashboard/DashboardShell";
import { toast } from "sonner";

// ─── Role config (mirrors UsersPage) ─────────────────────────────────────────

const ALL_ROLES = [
  { value: "owner",                label: "Owner",                tier: "owner",     dept: "operations" },
  { value: "ceo",                  label: "CEO",                  tier: "executive", dept: "executive"  },
  { value: "gm",                   label: "GM",                   tier: "executive", dept: "executive"  },
  { value: "admin",                label: "Admin",                tier: "admin",     dept: "operations" },
  { value: "ops_manager",          label: "Operations Manager",   tier: "admin",     dept: "operations" },
  { value: "sales_manager",        label: "Sales Manager",        tier: "manager",   dept: "sales"      },
  { value: "salesman",             label: "Salesman",             tier: "user",      dept: "sales"      },
  { value: "purchase_manager",     label: "Purchase Manager",     tier: "manager",   dept: "purchasing" },
  { value: "brand_manager",        label: "Brand Manager",        tier: "manager",   dept: "marketing"  },
  { value: "accountant",           label: "Accountant",           tier: "user",      dept: "finance"    },
  { value: "hr",                   label: "HR",                   tier: "user",      dept: "hr"         },
  { value: "invoice_team",         label: "Invoice Team",         tier: "user",      dept: "invoicing"  },
  { value: "inventory_controller", label: "Inventory Controller", tier: "manager",   dept: "warehouse"  },
  { value: "warehouse",            label: "Warehouse",            tier: "user",      dept: "warehouse"  },
  { value: "warehouse_manager",    label: "Warehouse Manager",    tier: "manager",   dept: "warehouse"  },
  { value: "cashier",              label: "Cashier",              tier: "user",      dept: "finance"    },
  { value: "secretary",            label: "Secretary",            tier: "user",      dept: "general"    },
  { value: "qc",                   label: "QC",                   tier: "user",      dept: "warehouse"  },
  { value: "read_only",            label: "Read Only",            tier: "user",      dept: "general"    },
] as const;

function getRoleInfo(role: string) {
  const found = ALL_ROLES.find(r => r.value === role);
  return { label: found?.label ?? role, tier: found?.tier ?? "user", dept: found?.dept ?? "general" };
}

const TIER_BADGE: Record<string, string> = {
  owner:     "bg-amber-500/15 text-amber-300  border-amber-500/30",
  executive: "bg-amber-500/10 text-amber-400  border-amber-500/20",
  admin:     "bg-blue-500/10  text-blue-400   border-blue-500/20",
  manager:   "bg-violet-500/10 text-violet-400 border-violet-500/20",
  user:      "bg-muted text-muted-foreground border-border",
};

const DEPT_COLOR: Record<string, string> = {
  executive:  "text-amber-400",
  operations: "text-blue-400",
  sales:      "text-emerald-400",
  warehouse:  "text-cyan-400",
  finance:    "text-orange-400",
  purchasing: "text-violet-400",
  invoicing:  "text-pink-400",
  marketing:  "text-rose-400",
  hr:         "text-teal-400",
  general:    "text-muted-foreground",
};

// ─── Module config (feature flags) ───────────────────────────────────────────

const MODULE_FLAGS_KEY = "fc_module_flags_v1";

const MODULES = [
  { id: "invoices",      label: "Invoice Management",  desc: "Invoice entry, printing, allocation",     icon: FileText,      color: "#3b82f6" },
  { id: "grn",           label: "GRN / Receiving",     desc: "Goods receipt & supplier management",     icon: Truck,         color: "#f59e0b" },
  { id: "reports",       label: "Reports",             desc: "Analytics, exports, customer reports",    icon: BarChart3,     color: "#8b5cf6" },
  { id: "import_export", label: "Import / Export",     desc: "Bulk data import & CSV export tools",     icon: FileSpreadsheet, color: "#f97316" },
  { id: "products",      label: "Product Management",  desc: "Product catalogue & master data",         icon: Package,       color: "#10b981" },
  { id: "qc",            label: "QC Inspection",       desc: "Quality control & GRN approval flow",    icon: ShieldCheck,   color: "#06b6d4" },
  { id: "customers",     label: "Customer Management", desc: "Customer accounts & salesman assignments",icon: Users,         color: "#ec4899" },
  { id: "salesmen",      label: "Salesman Management", desc: "Sales team & territory management",       icon: UserSquare2,   color: "#f43f5e" },
] as const;

const DEFAULT_FLAGS: Record<string, boolean> = Object.fromEntries(MODULES.map(m => [m.id, true]));

function useModuleFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(MODULE_FLAGS_KEY);
      return stored ? { ...DEFAULT_FLAGS, ...JSON.parse(stored) } : DEFAULT_FLAGS;
    } catch {
      return DEFAULT_FLAGS;
    }
  });

  const toggle = useCallback((id: string) => {
    setFlags(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(MODULE_FLAGS_KEY, JSON.stringify(next));
      toast.info(`${id.replace(/_/g, " ")} ${next[id] ? "enabled" : "disabled"}`);
      return next;
    });
  }, []);

  const enabledCount = Object.values(flags).filter(Boolean).length;

  return { flags, toggle, enabledCount };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string | null;
  is_active: boolean;
}

type EditedFields = { full_name?: string; role?: string; is_active?: boolean };

interface GrnRow {
  id: string;
  grn_no: string | null;
  supplier_name: string | null;
  status: string;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  total_amount: number | null;
  status: string | null;
  created_at: string;
}

interface SalesmanPerf {
  id: string;
  name: string;
  code: string | null;
  invoiceCount: number;
  revenue: number;
  customerCount: number;
}

interface SystemKpis {
  totalUsers: number;
  activeUsers: number;
  totalProducts: number;
  activeSkus: number;
  grnsToday: number;
  grnsPending: number;
  invoicesToday: number;
  customersTotal: number;
  salesmenTotal: number;
  expiredSkus: number;
  expiring30: number;
}

interface OwnerData {
  kpis: SystemKpis;
  recentGrns: GrnRow[];
  recentInvoices: InvoiceRow[];
  salesmen: SalesmanPerf[];
  users: ProfileRow[];
  lastActivity: Record<string, string>;
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useOwnerData() {
  const [data, setData] = useState<OwnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

      const [
        usersRes,
        productsRes,
        stockRes,
        grnsRes,
        invoicesRes,
        custRes,
        salesmanRes,
        custBySalesmanRes,
        expiredRes,
        exp30Res,
        auditRes,
      ] = await Promise.allSettled([
        // 1. All profiles
        supabase
          .from("profiles" as any)
          .select("id, full_name, email, role, created_at, is_active")
          .order("created_at", { ascending: true }),

        // 2. Product count
        supabase
          .from("product_master" as any)
          .select("id", { count: "exact", head: true }),

        // 3. Active SKUs in stock
        supabase
          .from("inventory_product_stock_summary" as any)
          .select("product_id", { count: "exact", head: true })
          .gt("available_quantity", 0),

        // 4. Recent GRNs
        supabase
          .from("receiving_headers" as any)
          .select("id, grn_no, supplier_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10),

        // 5. Recent invoices
        supabase
          .from("sales_invoices" as any)
          .select("id, invoice_number, customer_name, total_amount, status, created_at, salesman_id")
          .order("created_at", { ascending: false })
          .limit(20),

        // 6. Customer count
        supabase
          .from("customers" as any)
          .select("id", { count: "exact", head: true }),

        // 7. Active salesmen
        supabase
          .from("salesmen" as any)
          .select("id, name, code")
          .eq("is_active", true)
          .limit(20),

        // 8. Customer ↔ salesman mapping
        supabase
          .from("customers" as any)
          .select("salesman_id"),

        // 9. Expired stock SKUs
        supabase
          .from("inventory_product_stock_summary" as any)
          .select("product_id", { count: "exact", head: true })
          .gt("available_quantity", 0)
          .lt("nearest_expiry", today),

        // 10. Expiring ≤ 30 days
        supabase
          .from("inventory_product_stock_summary" as any)
          .select("product_id", { count: "exact", head: true })
          .gt("available_quantity", 0)
          .gte("nearest_expiry", today)
          .lte("nearest_expiry", in30),

        // 11. Recent audit log (last activity per user)
        supabase
          .from("audit_logs" as any)
          .select("performed_by, created_at")
          .not("performed_by", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      // ── Parse results ────────────────────────────────────────────────────

      const users: ProfileRow[] =
        usersRes.status === "fulfilled"
          ? ((usersRes.value as any).data ?? []).map((r: any) => ({
              id: r.id, full_name: r.full_name ?? "", email: r.email ?? "",
              role: r.role ?? "read_only", created_at: r.created_at, is_active: r.is_active ?? true,
            }))
          : [];

      const totalProducts: number =
        productsRes.status === "fulfilled" ? ((productsRes.value as any).count ?? 0) : 0;

      const activeSkus: number =
        stockRes.status === "fulfilled" ? ((stockRes.value as any).count ?? 0) : 0;

      const grns: GrnRow[] =
        grnsRes.status === "fulfilled" ? ((grnsRes.value as any).data ?? []) : [];

      const invoices: any[] =
        invoicesRes.status === "fulfilled" ? ((invoicesRes.value as any).data ?? []) : [];

      const customersTotal: number =
        custRes.status === "fulfilled" ? ((custRes.value as any).count ?? 0) : 0;

      const salesmanList: { id: string; name: string; code: string | null }[] =
        salesmanRes.status === "fulfilled" ? ((salesmanRes.value as any).data ?? []) : [];

      const custRows: { salesman_id: string | null }[] =
        custBySalesmanRes.status === "fulfilled" ? ((custBySalesmanRes.value as any).data ?? []) : [];

      const expiredSkus: number =
        expiredRes.status === "fulfilled" ? ((expiredRes.value as any).count ?? 0) : 0;

      const expiring30: number =
        exp30Res.status === "fulfilled" ? ((exp30Res.value as any).count ?? 0) : 0;

      const auditRows: { performed_by: string; created_at: string }[] =
        auditRes.status === "fulfilled" ? ((auditRes.value as any).data ?? []) : [];

      // ── Build derived data ───────────────────────────────────────────────

      // KPIs
      const totalUsers   = users.length;
      const activeUsers  = users.filter(u => u.is_active).length;
      const grnsToday    = grns.filter(g => (g.created_at ?? "").startsWith(today)).length;
      const grnsPending  = grns.filter(g => g.status === "received").length;
      const invoicesToday = invoices.filter(i => (i.created_at ?? "").startsWith(today)).length;
      const salesmenTotal = salesmanList.length;

      // Salesman performance
      const perfMap: Record<string, { invoices: number; revenue: number }> = {};
      for (const inv of invoices) {
        const sid = inv.salesman_id ?? "__none__";
        if (!perfMap[sid]) perfMap[sid] = { invoices: 0, revenue: 0 };
        perfMap[sid].invoices++;
        perfMap[sid].revenue += Number(inv.total_amount) || 0;
      }
      const custMap: Record<string, number> = {};
      for (const c of custRows) {
        if (c.salesman_id) custMap[c.salesman_id] = (custMap[c.salesman_id] ?? 0) + 1;
      }
      const salesmen: SalesmanPerf[] = salesmanList
        .map(s => ({
          id: s.id, name: s.name, code: s.code,
          invoiceCount:  perfMap[s.id]?.invoices     ?? 0,
          revenue:       perfMap[s.id]?.revenue      ?? 0,
          customerCount: custMap[s.id]               ?? 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      // Last activity map
      const lastActivity: Record<string, string> = {};
      for (const row of auditRows) {
        if (row.performed_by && !lastActivity[row.performed_by]) {
          lastActivity[row.performed_by] = row.created_at;
        }
      }

      setData({
        kpis: {
          totalUsers, activeUsers, totalProducts, activeSkus,
          grnsToday, grnsPending, invoicesToday,
          customersTotal, salesmenTotal, expiredSkus, expiring30,
        },
        recentGrns:     grns.slice(0, 8),
        recentInvoices: invoices.slice(0, 6),
        salesmen,
        users,
        lastActivity,
      });
      setLoading(false);
    }

    void load();
  }, [refreshKey]);

  return { data, loading, refresh };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 1)  return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    if (diffH < 168) return `${Math.round(diffH / 24)}d ago`;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch { return "—"; }
}

function fmtAED(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `AED ${Number(amount).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const p = name.trim().split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return p[0].slice(0, 2).toUpperCase();
  }
  return (email ?? "??").slice(0, 2).toUpperCase();
}

// ─── Section header (internal) ────────────────────────────────────────────────

function ControlSectionHeader({
  label,
  icon: Icon,
  color,
  count,
  action,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  count?: string | number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <h2 className="text-sm font-bold text-foreground tracking-tight">{label}</h2>
      {count != null && (
        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
          {count}
        </span>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ─── KPI mini card ────────────────────────────────────────────────────────────

function KpiMini({
  label, value, sub, color, loading,
}: {
  label: string; value: string | number; sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${color}`}>
      {loading ? (
        <div className="h-6 w-12 rounded bg-muted/50 animate-pulse mb-1" />
      ) : (
        <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{value}</p>
      )}
      <p className="text-[11px] font-medium text-foreground/80 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Inline toggle switch ─────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${checked ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, refresh } = useOwnerData();
  const { flags, toggle, enabledCount } = useModuleFlags();

  // ── User control state ───────────────────────────────────────────────────
  const [editedUsers, setEditedUsers] = useState<Record<string, EditedFields>>({});
  const [resetState, setResetState]   = useState<Record<string, "idle" | "sending">>({});
  const [saving, setSaving]           = useState(false);
  const [userSearch, setUserSearch]   = useState("");

  // Sync edits when data refreshes (clear stale edits)
  useEffect(() => { setEditedUsers({}); }, [data?.users]);

  const getVal = useCallback((profile: ProfileRow, field: keyof EditedFields) => {
    const edited = editedUsers[profile.id];
    if (edited && field in edited) return edited[field];
    if (field === "full_name") return profile.full_name ?? "";
    if (field === "role")      return profile.role;
    if (field === "is_active") return profile.is_active;
  }, [editedUsers]);

  const setField = useCallback((userId: string, field: keyof EditedFields, value: unknown) => {
    setEditedUsers(prev => {
      const profile = data?.users.find(p => p.id === userId);
      if (!profile) return prev;
      const current = prev[userId] ?? {};
      const original = field === "full_name" ? (profile.full_name ?? "")
                     : field === "role"      ? profile.role
                     : profile.is_active;
      const updated = { ...current, [field]: value };
      if (value === original) delete updated[field];
      if (Object.keys(updated).length === 0) {
        const { [userId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [userId]: updated };
    });
  }, [data?.users]);

  const changedCount = Object.keys(editedUsers).length;

  const handleSaveAll = async () => {
    if (!changedCount || !data) return;
    setSaving(true);
    let ok = 0; let err = 0;
    for (const [userId, fields] of Object.entries(editedUsers)) {
      const payload: Record<string, unknown> = {};
      if ("full_name" in fields) payload.full_name = (fields.full_name ?? "").trim();
      if ("role"      in fields) payload.role      = fields.role;
      if ("is_active" in fields) payload.is_active = fields.is_active;
      if (!Object.keys(payload).length) continue;
      const { error } = await supabase.from("profiles" as any).update(payload).eq("id", userId);
      if (error) { err++; }
      else {
        ok++;
        const profile = data.users.find(p => p.id === userId);
        if ("role"      in fields && profile) void logAudit({ entityType: "user", entityId: userId, action: "role_changed",   oldValue: { role: profile.role },        newValue: { role: fields.role },         metadata: { email: profile.email } });
        if ("is_active" in fields && profile) void logAudit({ entityType: "user", entityId: userId, action: fields.is_active ? "activated" : "deactivated", oldValue: { is_active: profile.is_active }, newValue: { is_active: fields.is_active }, metadata: { email: profile.email } });
      }
    }
    if (err === 0) { toast.success(`${ok} user${ok !== 1 ? "s" : ""} saved`); setEditedUsers({}); refresh(); }
    else           { toast.error(`${err} failed, ${ok} saved`); }
    setSaving(false);
  };

  const handleResetPassword = async (profile: ProfileRow) => {
    const email = profile.email?.trim();
    if (!email) { toast.error("No email for this user"); return; }
    setResetState(prev => ({ ...prev, [profile.id]: "sending" }));
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${getAppUrl()}/reset-password` });
    if (error) toast.error(`Reset failed: ${error.message}`);
    else {
      toast.success(`Reset sent to ${email}`);
      void logAudit({ entityType: "user", entityId: profile.id, action: "password_reset", metadata: { email } });
    }
    setResetState(prev => ({ ...prev, [profile.id]: "idle" }));
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q || !data?.users) return data?.users ?? [];
    return data.users.filter(u =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [data?.users, userSearch]);

  // ── Operational stats ────────────────────────────────────────────────────
  const maxRevenue = data?.salesmen[0]?.revenue ?? 1;

  return (
    <div className="min-h-screen bg-background pb-32">

      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 shrink-0">
            <Crown className="w-4.5 h-4.5 text-amber-400" style={{ width: 18, height: 18 }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-tight">Owner Control Panel</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {user?.email ?? "System Owner"} · {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}
            </p>
          </div>

          {/* Unsaved indicator */}
          {changedCount > 0 && (
            <span className="text-[11px] text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 shrink-0">
              {changedCount} unsaved
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {changedCount > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs border border-border bg-muted/30 text-foreground px-3 py-1.5 rounded-lg font-medium hover:bg-muted/50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 1 — System KPIs
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader label="System Overview" icon={Activity} color="bg-blue-500/10 text-blue-400 border border-blue-500/20" />

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiMini label="Total Users"    value={data?.kpis.totalUsers    ?? "—"} sub="All accounts"         color="border-blue-500/20  bg-blue-500/8"    loading={loading} />
            <KpiMini label="Active Users"   value={data?.kpis.activeUsers   ?? "—"} sub="Enabled logins"      color="border-emerald-500/20 bg-emerald-500/8" loading={loading} />
            <KpiMini label="Products"       value={data?.kpis.totalProducts ?? "—"} sub="In catalogue"        color="border-violet-500/20 bg-violet-500/8"  loading={loading} />
            <KpiMini label="SKUs In Stock"  value={data?.kpis.activeSkus    ?? "—"} sub="Available batches"   color="border-cyan-500/20   bg-cyan-500/8"    loading={loading} />
            <KpiMini label="Customers"      value={data?.kpis.customersTotal ?? "—"} sub="Total accounts"     color="border-pink-500/20   bg-pink-500/8"    loading={loading} />
            <KpiMini label="Active Salesmen" value={data?.kpis.salesmenTotal ?? "—"} sub="Sales team"         color="border-rose-500/20   bg-rose-500/8"    loading={loading} />
          </div>

          {/* Second KPI row: operational */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
            <KpiMini label="GRNs Today"       value={data?.kpis.grnsToday    ?? "—"} sub="Received today"    color="border-amber-500/20 bg-amber-500/8"  loading={loading} />
            <KpiMini label="Pending Inspect"  value={data?.kpis.grnsPending  ?? "—"} sub="Awaiting QC"       color="border-amber-500/20 bg-amber-500/8"  loading={loading} />
            <KpiMini label="Invoices Today"   value={data?.kpis.invoicesToday ?? "—"} sub="Processed today"  color="border-blue-500/20  bg-blue-500/8"   loading={loading} />
            <KpiMini
              label="Expired SKUs"
              value={data?.kpis.expiredSkus ?? "—"}
              sub="Past expiry"
              color={data?.kpis.expiredSkus ? "border-red-500/20 bg-red-500/8" : "border-border bg-muted/10"}
              loading={loading}
            />
            <KpiMini
              label="Expiring ≤ 30d"
              value={data?.kpis.expiring30 ?? "—"}
              sub="Near expiry"
              color={data?.kpis.expiring30 ? "border-orange-500/20 bg-orange-500/8" : "border-border bg-muted/10"}
              loading={loading}
            />
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 2 — Operations Feed
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader label="Operational Feed" icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" />

          <div className="grid md:grid-cols-3 gap-4">

            {/* Recent GRNs */}
            <SectionCard
              title="Recent GRNs"
              icon={Truck}
              iconClass="text-amber-400"
              action={<button onClick={() => navigate("/grn")} className="text-[10px] text-primary font-medium hover:underline">View all →</button>}
            >
              {loading ? <LoadingRows count={4} /> :
               !data?.recentGrns.length ? <EmptyState icon={Truck} message="No GRNs yet" /> : (
                <div className="space-y-1.5">
                  {data.recentGrns.map(grn => (
                    <button
                      key={grn.id}
                      onClick={() => navigate(`/grn/${grn.id}`)}
                      className="w-full flex items-center gap-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 px-3 py-2 transition text-left"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{grn.grn_no ?? grn.id.slice(0,8)}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{grn.supplier_name ?? "—"}</p>
                      </div>
                      <StatusPill status={grn.status} />
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Expiry Alerts */}
            <SectionCard title="Expiry Alerts" icon={CalendarX2} iconClass="text-orange-400">
              {loading ? <LoadingRows count={3} /> : (
                <div className="space-y-2">
                  {(data?.kpis.expiredSkus ?? 0) > 0 && (
                    <div className="flex items-center gap-2.5 rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-red-400">Expired Stock</p>
                        <p className="text-[10px] text-muted-foreground">Requires immediate removal</p>
                      </div>
                      <span className="text-sm font-bold text-red-400 shrink-0">{data?.kpis.expiredSkus}</span>
                    </div>
                  )}
                  {(data?.kpis.expiring30 ?? 0) > 0 && (
                    <div className="flex items-center gap-2.5 rounded-lg bg-orange-500/8 border border-orange-500/20 px-3 py-2.5">
                      <Clock className="w-4 h-4 text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-orange-400">Expiring Soon</p>
                        <p className="text-[10px] text-muted-foreground">Within 30 days</p>
                      </div>
                      <span className="text-sm font-bold text-orange-400 shrink-0">{data?.kpis.expiring30}</span>
                    </div>
                  )}
                  {(data?.kpis.grnsPending ?? 0) > 0 && (
                    <div className="flex items-center gap-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                      <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-400">Pending Inspection</p>
                        <p className="text-[10px] text-muted-foreground">GRNs awaiting QC</p>
                      </div>
                      <span className="text-sm font-bold text-amber-400 shrink-0">{data?.kpis.grnsPending}</span>
                    </div>
                  )}
                  {!loading && !data?.kpis.expiredSkus && !data?.kpis.expiring30 && !data?.kpis.grnsPending && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/8 border border-emerald-500/15 px-3 py-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <p className="text-xs text-emerald-400 font-medium">No active alerts</p>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Recent Invoices */}
            <SectionCard
              title="Recent Invoices"
              icon={FileText}
              iconClass="text-blue-400"
              action={<button onClick={() => navigate("/invoice-entry")} className="text-[10px] text-primary font-medium hover:underline">View all →</button>}
            >
              {loading ? <LoadingRows count={4} /> :
               !data?.recentInvoices.length ? <EmptyState icon={FileText} message="No invoices yet" /> : (
                <div className="space-y-1.5">
                  {data.recentInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">#{inv.invoice_number ?? inv.id.slice(0,8)}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{inv.customer_name ?? "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-semibold text-foreground">{fmtAED(inv.total_amount)}</p>
                        {inv.status && <StatusPill status={inv.status} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 3 — Sales Performance
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader
            label="Sales Performance"
            icon={BarChart3}
            color="bg-violet-500/10 text-violet-400 border border-violet-500/20"
            count={`${data?.salesmen.length ?? 0} salesmen`}
            action={<button onClick={() => navigate("/salesmen")} className="text-[10px] text-primary font-medium hover:underline">Manage →</button>}
          />

          {loading ? (
            <LoadingRows count={3} />
          ) : !data?.salesmen.length ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <EmptyState icon={UserSquare2} message="No active salesmen" sub="Add salesmen to track performance" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
                {data.salesmen.map((s, i) => {
                  const barPct = maxRevenue > 0 ? Math.round((s.revenue / maxRevenue) * 100) : 0;
                  return (
                    <div key={s.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                        <p className="text-xs font-semibold text-foreground flex-1 truncate">{s.name}</p>
                        {s.code && (
                          <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">{s.code}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground shrink-0">{s.customerCount} cust</span>
                        <span className="text-[10px] font-medium text-violet-400 shrink-0">{s.invoiceCount} inv</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-700"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-32 text-right shrink-0">
                          {s.revenue > 0 ? fmtAED(s.revenue) : "No invoices"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 4 — User Control
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader
            label="User Control"
            icon={Users}
            color="bg-blue-500/10 text-blue-400 border border-blue-500/20"
            count={`${data?.users.length ?? 0} users · ${data?.users.filter(u => u.is_active).length ?? 0} active`}
            action={
              <div className="flex items-center gap-2">
                {changedCount > 0 && (
                  <span className="text-[11px] text-amber-500 font-medium">{changedCount} pending</span>
                )}
                <button
                  onClick={handleSaveAll}
                  disabled={!changedCount || saving}
                  className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground px-2.5 py-1 rounded-md font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save All
                </button>
                <button onClick={() => navigate("/admin/users")} className="text-[10px] text-primary font-medium hover:underline">
                  Full page →
                </button>
              </div>
            }
          />

          {/* User search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Users table */}
          {loading ? (
            <LoadingRows count={5} />
          ) : filteredUsers.length === 0 ? (
            <EmptyState icon={Users} message="No users found" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    {["#", "User", "Email", "Role", "Tier", "Status", "Last Active", "Reset PW"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((profile, idx) => {
                    const isEdited    = profile.id in editedUsers;
                    const isActive    = getVal(profile, "is_active") as boolean;
                    const effectRole  = (getVal(profile, "role") as string) ?? profile.role;
                    const roleInfo    = getRoleInfo(effectRole);
                    const resetLoading = resetState[profile.id] === "sending";
                    const lastSeen    = data?.lastActivity[profile.id];

                    return (
                      <tr
                        key={profile.id}
                        className={`border-t border-border hover:bg-muted/10 transition-colors ${isEdited ? "bg-amber-500/4" : ""}`}
                      >
                        {/* # */}
                        <td className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground">{idx + 1}</td>

                        {/* User */}
                        <td className="px-3 py-1.5 min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-primary">
                                {getInitials(profile.full_name, profile.email)}
                              </span>
                            </div>
                            <input
                              type="text"
                              value={(getVal(profile, "full_name") as string) ?? ""}
                              onChange={e => setField(profile.id, "full_name", e.target.value)}
                              disabled={saving}
                              className="flex-1 min-w-0 bg-transparent border border-transparent rounded px-1.5 py-0.5 text-xs text-foreground focus:bg-background focus:border-border focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-3 py-1.5 text-[10px] text-muted-foreground max-w-[180px] truncate">
                          {profile.email || "—"}
                        </td>

                        {/* Role dropdown */}
                        <td className="px-3 py-1.5 min-w-[150px]">
                          <select
                            value={effectRole}
                            onChange={e => setField(profile.id, "role", e.target.value)}
                            disabled={saving}
                            className="w-full bg-transparent border border-transparent rounded px-1.5 py-0.5 text-xs text-foreground focus:bg-background focus:border-border focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {ALL_ROLES.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Tier */}
                        <td className="px-3 py-1.5">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize ${TIER_BADGE[roleInfo.tier] ?? TIER_BADGE.user}`}>
                            {roleInfo.tier}
                          </span>
                        </td>

                        {/* Active toggle */}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <Toggle
                              checked={isActive}
                              onChange={() => setField(profile.id, "is_active", !isActive)}
                            />
                            <span className={`text-[10px] font-medium ${isActive ? "text-emerald-400" : "text-red-400"}`}>
                              {isActive ? "Active" : "Off"}
                            </span>
                          </div>
                        </td>

                        {/* Last active */}
                        <td className="px-3 py-1.5 text-[10px] text-muted-foreground whitespace-nowrap">
                          {lastSeen ? fmtDateShort(lastSeen) : "—"}
                        </td>

                        {/* Reset PW */}
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => handleResetPassword(profile)}
                            disabled={resetLoading || !profile.email}
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-2 py-0.5 text-[10px] text-foreground hover:bg-muted/40 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {resetLoading
                              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              : <RotateCcw className="w-2.5 h-2.5" />
                            }
                            Reset
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 5 — Module Control
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader
            label="Module Control"
            icon={Power}
            color="bg-rose-500/10 text-rose-400 border border-rose-500/20"
            count={`${enabledCount} / ${MODULES.length} enabled`}
          />

          <div className="rounded-xl border border-border bg-card p-1.5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
              {MODULES.map(mod => {
                const Icon    = mod.icon;
                const enabled = flags[mod.id] ?? true;
                return (
                  <div
                    key={mod.id}
                    className={`rounded-lg border p-3.5 transition-all ${
                      enabled
                        ? "border-border bg-muted/20"
                        : "border-border/40 bg-muted/5 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${mod.color}18`, border: `1px solid ${mod.color}30` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: mod.color }} />
                      </div>
                      <Toggle checked={enabled} onChange={() => toggle(mod.id)} />
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-tight">{mod.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{mod.desc}</p>
                    <div className={`mt-2 inline-flex items-center gap-1 text-[9px] font-semibold rounded px-1.5 py-0.5 ${
                      enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-muted-foreground/50"}`} />
                      {enabled ? "ENABLED" : "DISABLED"}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-3 pb-2">
              Module flags stored locally · DB-backed registry coming in a future phase
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 6 — Quick Navigation
            ═════════════════════════════════════════════════════════════════════*/}
        <section>
          <ControlSectionHeader label="Quick Navigation" icon={Shield} color="bg-muted/50 text-muted-foreground border border-border" />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { label: "GRN List",       path: "/grn",            color: "text-amber-400",  bg: "bg-amber-500/8",  border: "border-amber-500/20",  icon: Truck       },
              { label: "Invoices",       path: "/invoice-entry",  color: "text-blue-400",   bg: "bg-blue-500/8",   border: "border-blue-500/20",   icon: FileText    },
              { label: "Products",       path: "/products",       color: "text-emerald-400",bg: "bg-emerald-500/8",border: "border-emerald-500/20",icon: Package     },
              { label: "Customers",      path: "/customers",      color: "text-pink-400",   bg: "bg-pink-500/8",   border: "border-pink-500/20",   icon: Users       },
              { label: "Salesmen",       path: "/salesmen",       color: "text-rose-400",   bg: "bg-rose-500/8",   border: "border-rose-500/20",   icon: UserSquare2 },
              { label: "Reports",        path: "/reports",        color: "text-violet-400", bg: "bg-violet-500/8", border: "border-violet-500/20", icon: BarChart3   },
              { label: "Import/Export",  path: "/import-export",  color: "text-orange-400", bg: "bg-orange-500/8", border: "border-orange-500/20", icon: FileSpreadsheet },
              { label: "Users (Admin)",  path: "/admin/users",    color: "text-cyan-400",   bg: "bg-cyan-500/8",   border: "border-cyan-500/20",   icon: Shield      },
            ].map(({ label, path, color, bg, border, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`text-left rounded-xl border ${border} ${bg} p-3 hover:opacity-80 active:scale-[0.97] transition-all`}
              >
                <Icon className={`w-4 h-4 mb-1.5 ${color}`} />
                <p className="text-[11px] font-semibold text-foreground">{label}</p>
              </button>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
