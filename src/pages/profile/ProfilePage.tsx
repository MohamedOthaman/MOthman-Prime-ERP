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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import type { RoleTier } from "@/types/roles";

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
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: Crown,
    accentBar: "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300",
    avatarCls: "bg-amber-500 text-amber-950",
  },
  executive: {
    label: "Executive",
    color: "text-amber-300",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    icon: Star,
    accentBar: "bg-gradient-to-r from-amber-400 to-yellow-300",
    avatarCls: "bg-amber-400 text-amber-950",
  },
  admin: {
    label: "Admin",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    icon: Shield,
    accentBar: "bg-gradient-to-r from-blue-600 to-blue-400",
    avatarCls: "bg-blue-500 text-white",
  },
  manager: {
    label: "Manager",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/25",
    icon: Briefcase,
    accentBar: "bg-gradient-to-r from-violet-600 to-violet-400",
    avatarCls: "bg-violet-500 text-white",
  },
  user: {
    label: "Staff",
    color: "text-muted-foreground",
    bg: "bg-muted/40",
    border: "border-border",
    icon: User,
    accentBar: "bg-muted",
    avatarCls: "bg-muted text-muted-foreground",
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
          {/* Tier accent bar */}
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
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${granted ? "bg-emerald-500/5 border-emerald-500/15" : "bg-muted/15 border-border"}`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${granted ? "text-emerald-400" : "text-muted-foreground/30"}`} />
                  <span className={`text-xs flex-1 ${granted ? "text-foreground" : "text-muted-foreground/45"}`}>
                    {label}
                  </span>
                  {granted
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
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
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
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
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-3.5 h-3.5 text-violet-400" />
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
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Settings className="w-3.5 h-3.5 text-blue-400" />
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
