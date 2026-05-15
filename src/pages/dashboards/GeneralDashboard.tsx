/**
 * GeneralDashboard — fallback dashboard for hr, secretary, and read_only roles.
 *
 * Role-adaptive: action links and subtitle change based on role/department.
 * No Supabase queries — contextual/static only to prevent data leakage.
 */

import {
  Briefcase,
  BarChart3,
  FileText,
  Users,
  Package,
  UserCircle,
  ShieldCheck,
  BookOpen,
  Clock,
  Building2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";
import {
  DashboardShell,
  WelcomeBar,
  SectionCard,
  ActionGrid,
  type ActionItem,
} from "@/components/dashboard/DashboardShell";

// ─── Access summary item type ──────────────────────────────────────────────────

interface AccessItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GeneralDashboard() {
  const navigate = useNavigate();
  const { t }    = useLang();
  const { user } = useAuth();
  const { role } = usePermissions();

  const fullName = user?.user_metadata?.full_name as string | undefined;

  const ROLE_LABELS: Record<string, string> = {
    hr:        t("roleHr", "Human Resources"),
    secretary: t("roleSecretary", "Secretary"),
    read_only: t("roleReadOnly", "Read Only"),
  };

  const ROLE_SUBTITLES: Record<string, string> = {
    hr:        t("hrWorkspace", "People & HR workspace"),
    secretary: t("adminWorkspace", "Administrative workspace"),
    read_only: t("viewOnlyAccess", "View-only access"),
  };

  const myProfile = { label: t("myProfile", "My Profile"), path: "/profile", icon: UserCircle, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", description: t("viewYourProfile", "View your profile & role") };

  const actionsMap: Record<string, ActionItem[]> = {
    hr: [
      { label: t("manageUsers", "Users"), path: "/admin/users", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", description: t("manageTeamAccounts", "Manage team accounts") },
      myProfile,
    ],
    secretary: [
      { label: t("invoicesNav", "Invoices"), path: "/invoices", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", description: t("viewInvoiceRecords", "View invoice records") },
      { label: t("customersNav", "Customers"), path: "/customers", icon: Building2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", description: t("viewCustomerList", "View customer list") },
      { label: t("reports", "Reports"), path: "/reports", icon: BarChart3, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", description: t("availableReports", "Available reports") },
      myProfile,
    ],
  };

  const accessItemsMap: Record<string, AccessItem[]> = {
    hr: [
      { label: t("manageUsers", "User Management"), path: "/admin/users", icon: Users, iconClass: "text-blue-400" },
      { label: t("myProfile", "My Profile"), path: "/profile", icon: UserCircle, iconClass: "text-violet-400" },
    ],
    secretary: [
      { label: t("invoiceListView", "Invoice List (View)"), path: "/invoices", icon: FileText, iconClass: "text-blue-400" },
      { label: t("customersView", "Customers (View)"), path: "/customers", icon: Building2, iconClass: "text-emerald-400" },
      { label: t("reportsHub", "Reports Hub"), path: "/reports", icon: BarChart3, iconClass: "text-amber-400" },
      { label: t("myProfile", "My Profile"), path: "/profile", icon: UserCircle, iconClass: "text-violet-400" },
    ],
  };

  const defaultActions: ActionItem[] = [
    { label: t("stockOverview", "Stock"), path: "/stock", icon: Package, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", description: t("viewInventory", "View inventory") },
    myProfile,
  ];

  const defaultAccessItems: AccessItem[] = [
    { label: t("stockOverviewView", "Stock Overview (View)"), path: "/stock", icon: Package, iconClass: "text-cyan-400" },
    { label: t("myProfile", "My Profile"), path: "/profile", icon: UserCircle, iconClass: "text-violet-400" },
  ];

  const roleLabel   = ROLE_LABELS[role]    ?? role;
  const subtitle    = ROLE_SUBTITLES[role] ?? t("workspace", "Workspace");
  const actions     = actionsMap[role]     ?? defaultActions;
  const accessItems = accessItemsMap[role] ?? defaultAccessItems;

  return (
    <DashboardShell
      icon={Briefcase}
      title={roleLabel}
      subtitle={subtitle}
      accent="teal"
    >
      <WelcomeBar name={fullName} roleLabel={roleLabel} accent="teal" />

      <SectionCard title={t("quickActions", "Quick Actions")} icon={Clock} iconClass="text-teal-400">
        <ActionGrid
          actions={actions}
          onNavigate={navigate}
          cols={actions.length <= 2 ? 2 : 4}
          title=""
        />
      </SectionCard>

      <SectionCard
        title={t("yourAccess", "Your Access")}
        icon={ShieldCheck}
        iconClass="text-violet-400"
      >
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground mb-2">
            {t("pagesAvailableToRole", "Pages available to your role")}
          </p>
          <div className="divide-y divide-border">
            {accessItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-3 px-1 py-2.5 hover:bg-muted/30 rounded-lg transition-colors text-left group"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${item.iconClass}`} />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wide">
                    {item.path}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("systemInfo", "System Info")} icon={BookOpen} iconClass="text-muted-foreground">
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="font-semibold text-foreground mb-0.5">{t("role", "Role")}</p>
            <p className="capitalize">{roleLabel}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <p className="font-semibold text-foreground mb-0.5">{t("accessLevel", "Access Level")}</p>
            <p>{t("viewOnly", "View Only")}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 col-span-2">
            <p className="font-semibold text-foreground mb-0.5">{t("system", "System")}</p>
            <p>{t("brandName", "Food Choice ERP")} — {t("kuwaitOperations", "Kuwait Operations")}</p>
          </div>
        </div>
      </SectionCard>
    </DashboardShell>
  );
}
