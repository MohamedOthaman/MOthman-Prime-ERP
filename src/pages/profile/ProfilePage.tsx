import {
  LogOut,
  Shield,
  ChevronRight,
  User,
  CheckCircle2,
  XCircle,
  Eye,
  LayoutDashboard,
  BarChart3,
  Package,
  FileText,
  Truck,
  Users,
  FileSpreadsheet,
  ArrowLeft,
  Crown,
  Star,
  Briefcase,
  Settings,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  HeartPulse,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import type { RoleTier } from "@/types/roles";
import { getMockUserByRole, getMockUserByEmail, type MockKPI } from "@/data/mockUsers";

// ─── Tier display config ──────────────────────────────────────────────────────

const TIER_CONFIG: Record<RoleTier, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ComponentType<{ className?: string }>;
  accentBar: string;
  avatarCls: string;
}> = {
  owner: {
    label: "Owner",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/20",
    icon: Crown,
    accentBar: "bg-amber-500",
    avatarCls: "bg-amber-500 text-white",
  },
  executive: {
    label: "Executive",
    color: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-400/10",
    border: "border-amber-200 dark:border-amber-400/20",
    icon: Star,
    accentBar: "bg-amber-400",
    avatarCls: "bg-amber-400 text-amber-950",
  },
  admin: {
    label: "Admin",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20",
    icon: Shield,
    accentBar: "bg-blue-500",
    avatarCls: "bg-blue-500 text-white",
  },
  manager: {
    label: "Manager",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/20",
    icon: Briefcase,
    accentBar: "bg-violet-500",
    avatarCls: "bg-violet-500 text-white",
  },
  user: {
    label: "Staff",
    color: "text-muted-foreground",
    bg: "bg-muted/40",
    border: "border-border",
    icon: User,
    accentBar: "bg-muted-foreground/40",
    avatarCls: "bg-muted text-muted-foreground border border-border",
  },
};

const TIER_STEPS: RoleTier[] = ["user", "manager", "admin", "executive", "owner"];

const DEPT_LABELS: Record<string, string> = {
  operations: "Operations",
  executive: "Executive",
  sales: "Sales",
  warehouse: "Warehouse & Inventory",
  purchasing: "Purchasing",
  finance: "Finance & Accounting",
  invoicing: "Invoicing",
  marketing: "Marketing",
  hr: "Human Resources",
  general: "General",
};

// ─── Permission display matrix ────────────────────────────────────────────────

const PERMISSIONS = [
  { key: "canManageInvoices" as const, label: "Manage Invoices", icon: FileText },
  { key: "canManageReceiving" as const, label: "GRN / Receiving", icon: Truck },
  { key: "canManageStock" as const, label: "Stock & Products", icon: Package },
  { key: "canManageCustomers" as const, label: "Customers", icon: Users },
  { key: "canManageSalesmen" as const, label: "Salesmen", icon: Users },
  { key: "canViewReports" as const, label: "Reports", icon: BarChart3 },
  { key: "canImportExport" as const, label: "Import / Export", icon: FileSpreadsheet },
  { key: "canEditUsers" as const, label: "User Management", icon: Shield },
  { key: "canPreviewAsUser" as const, label: "View as Other User", icon: Eye },
  { key: "canUseVisualBuilder" as const, label: "Dashboard Builder", icon: LayoutDashboard },
];

// ─── KPI icon mapping ─────────────────────────────────────────────────────────

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Total Sales": TrendingUp,
  "Inventory Health": HeartPulse,
  "Activity Count": Activity,
};

const KPI_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-100 dark:border-emerald-500/15" },
  blue:    { text: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-50 dark:bg-blue-500/10",       border: "border-blue-100 dark:border-blue-500/15"    },
  violet:  { text: "text-violet-600 dark:text-violet-400",   bg: "bg-violet-50 dark:bg-violet-500/10",   border: "border-violet-100 dark:border-violet-500/15" },
  amber:   { text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10",     border: "border-amber-100 dark:border-amber-500/15"   },
  rose:    { text: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-500/10",       border: "border-rose-100 dark:border-rose-500/15"     },
};

// ─── Quick action icon mapping ────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText: FileText,
  BarChart3: BarChart3,
  Package: Package,
  Users: Users,
  ClipboardList: Truck,
  AlertTriangle: Zap,
  ScanLine: FileSpreadsheet,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(fullName?: string, email?: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

function formatSignIn(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function TrendIndicator({ trend, value }: { trend?: string; value?: string }) {
  if (!trend || !value || value === "N/A") return null;

  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
        <TrendingUp className="w-3 h-3" />
        {value}
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
        <TrendingDown className="w-3 h-3" />
        {value}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground font-medium">
      <Minus className="w-3 h-3" />
      {value}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  const { tier, role, department } = permissions;
  const cfg = TIER_CONFIG[tier];
  const TierIcon = cfg.icon;
  const fullName = user?.user_metadata?.full_name as string | undefined;
  const initials = getInitials(fullName, user?.email);
  const tierIndex = TIER_STEPS.indexOf(tier);
  const deptLabel = DEPT_LABELS[department] ?? department;

  // Get mock KPIs and quick actions for the current user
  const userEmail = user?.email ?? "";
  const mockUser = getMockUserByEmail(userEmail) || getMockUserByRole(role);
  const kpis: MockKPI[] = mockUser?.kpis ?? [
    { label: "Total Sales", value: "—", color: "emerald" },
    { label: "Inventory Health", value: "—", color: "blue" },
    { label: "Activity Count", value: "—", color: "violet" },
  ];
  const quickActions = mockUser?.quickActions ?? [
    { label: "View Reports", path: "/reports", icon: "BarChart3", color: "violet" },
    { label: "Check Stock", path: "/stock", icon: "Package", color: "emerald" },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Page header ───────────────────────────────────────── */}
      <header className="sticky top-11 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition text-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <h1 className="text-[14px] font-semibold text-foreground">My Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* ── Identity card ──────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Tier accent bar — thin, solid color */}
          <div className={`h-[3px] w-full ${cfg.accentBar}`} />

          <div className="p-5 flex items-start gap-4">
            {/* Avatar */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 ${cfg.avatarCls}`}>
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground truncate">
                {fullName ?? user?.email?.split("@")[0] ?? "User"}
              </h2>
              <p className="text-sm text-muted-foreground truncate">{user?.email ?? "—"}</p>

              {/* Badges */}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                  <TierIcon className="w-3 h-3" />
                  {cfg.label}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                  {role.replace(/_/g, " ")}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {deptLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
            Key Metrics
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {kpis.map((kpi) => {
              const colors = KPI_COLORS[kpi.color] ?? KPI_COLORS.blue;
              const KpiIcon = KPI_ICONS[kpi.label] ?? Activity;
              return (
                <div key={kpi.label} className="kpi-card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors.bg} ${colors.border} border`}>
                      <KpiIcon className={`w-3.5 h-3.5 ${colors.text}`} />
                    </div>
                  </div>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {kpi.value}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-muted-foreground">
                      {kpi.label}
                    </p>
                    <TrendIndicator trend={kpi.trend} value={kpi.trendValue} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Quick Actions ───────────────────────────────────── */}
        <div>
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {quickActions.map((action) => {
              const ActionIcon = ACTION_ICONS[action.icon] ?? Zap;
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="action-card group"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/60 border border-border flex items-center justify-center shrink-0 group-hover:border-primary/20 transition-colors">
                    <ActionIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Authority tier visualization ───────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Authority Level
          </h3>
          <div className="flex items-start gap-0">
            {TIER_STEPS.map((step, idx) => {
              const sc = TIER_CONFIG[step];
              const StepIcon = sc.icon;
              const isActive = idx === tierIndex;
              const isPast = idx < tierIndex;

              return (
                <div key={step} className="flex items-center flex-1 min-w-0">
                  <div className={`flex flex-col items-center gap-1.5 flex-1 ${isActive ? "opacity-100" : isPast ? "opacity-55" : "opacity-20"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${isActive ? `${sc.bg} ${sc.border}` : "bg-muted border-border"}`}>
                      <StepIcon className={`w-3.5 h-3.5 ${isActive ? sc.color : "text-muted-foreground"}`} />
                    </div>
                    <span className={`text-[9px] font-semibold text-center leading-tight ${isActive ? sc.color : "text-muted-foreground"}`}>
                      {sc.label}
                    </span>
                  </div>
                  {idx < TIER_STEPS.length - 1 && (
                    <div className={`h-px flex-shrink-0 w-3 -mt-4 ${isPast ? "bg-amber-400/40" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Permission matrix ──────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Access & Permissions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PERMISSIONS.map(({ key, label, icon: Icon }) => {
              const granted = permissions[key] as boolean;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${granted ? "bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/15" : "bg-muted/15 border-border"}`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${granted ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/30"}`} />
                  <span className={`text-xs flex-1 ${granted ? "text-foreground" : "text-muted-foreground/45"}`}>
                    {label}
                  </span>
                  {granted
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0" />
                  }
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Account actions ────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account</h3>
          </div>

          {permissions.canPreviewAsUser && (
            <button
              onClick={() => navigate("/admin/preview-as")}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition border-t border-border"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center shrink-0">
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">View as Another User</p>
                <p className="text-[11px] text-muted-foreground">Preview the system through any role's perspective</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {permissions.canUseVisualBuilder && (
            <button
              onClick={() => navigate("/admin/dashboard-builder")}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition border-t border-border"
            >
              <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">Dashboard Builder</p>
                <p className="text-[11px] text-muted-foreground">Customize role layouts and widget configurations</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {permissions.canEditUsers && (
            <button
              onClick={() => navigate("/admin/users")}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition border-t border-border"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center shrink-0">
                <Settings className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-foreground">User Management</p>
                <p className="text-[11px] text-muted-foreground">Manage accounts, roles, and access</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-destructive/5 transition border-t border-border group"
          >
            <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center shrink-0 group-hover:bg-destructive/10 group-hover:border-destructive/20 transition">
              <LogOut className="w-3.5 h-3.5 text-muted-foreground group-hover:text-destructive transition" />
            </div>
            <span className="text-sm font-medium text-foreground group-hover:text-destructive transition">Sign Out</span>
          </button>
        </div>

        {/* ── Session metadata ───────────────────────────────── */}
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/50 font-medium">Session Info</span>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/40 font-mono">
              User ID: {user?.id?.slice(0, 16)}…
            </p>
            <p className="text-[10px] text-muted-foreground/40 font-mono">
              Last sign-in: {formatSignIn(user?.last_sign_in_at)}
            </p>
            <p className="text-[10px] text-muted-foreground/40 font-mono">
              Role: {role} · Tier: {tier} · Dept: {department}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
