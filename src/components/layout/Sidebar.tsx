import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  BarChart3,
  Package,
  Settings,
  FileSpreadsheet,
  ScanLine,
  RotateCcw,
  Activity,
  Users,
  UserCog,
  Snowflake,
  ListChecks,
  Shield,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";

interface SidebarLink {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  show: boolean;
}

interface SidebarSection {
  title: string;
  links: SidebarLink[];
}

export function Sidebar() {
  const { t } = useLang();
  const {
    canManageInvoices,
    canManageReceiving,
    canImportExport,
    canViewReports,
    canManageStock,
    canEditUsers,
    isOwner,
    isAdmin,
  } = usePermissions();

  const sections: SidebarSection[] = [
    {
      title: "Dashboard",
      links: [
        { to: "/", icon: LayoutDashboard, label: "Dashboard", show: true },
        { to: "/stock", icon: Package, label: "Stock", show: canManageStock || isAdmin },
      ],
    },
    {
      title: "Sales",
      links: [
        { to: "/invoices", icon: FileText, label: t("invoices") ?? "Invoices", show: canManageInvoices },
        { to: "/invoice-entry", icon: FileText, label: "New Invoice", show: canManageInvoices },
        { to: "/customers", icon: Users, label: "Customers", show: canManageInvoices || isAdmin },
        { to: "/salesmen", icon: UserCog, label: "Salesmen", show: isAdmin },
        { to: "/returns", icon: RotateCcw, label: "Returns", show: canManageInvoices || canManageReceiving },
      ],
    },
    {
      title: "Warehouse",
      links: [
        { to: "/warehouse/picking", icon: ScanLine, label: "Picking", show: canManageStock || isAdmin },
        { to: "/warehouse/movements", icon: Activity, label: "Movements", show: canManageStock || isAdmin },
        { to: "/warehouse/fridge", icon: Snowflake, label: "Fridge", show: canManageStock || isAdmin },
        { to: "/warehouse/batch-trace", icon: ListChecks, label: "Batch Trace", show: canManageStock || isAdmin },
      ],
    },
    {
      title: "Receiving",
      links: [
        { to: "/grn", icon: ClipboardList, label: "GRN", show: canManageReceiving || isAdmin },
        { to: "/products", icon: Package, label: "Products", show: canManageStock || isAdmin },
        { to: "/import-export", icon: FileSpreadsheet, label: t("io") ?? "Import / Export", show: canImportExport || isAdmin },
      ],
    },
    {
      title: "Reports",
      links: [
        { to: "/reports", icon: BarChart3, label: t("reports") ?? "Reports", show: canViewReports },
      ],
    },
    {
      title: "Admin",
      links: [
        { to: "/admin/users", icon: UserCog, label: "Users", show: canEditUsers },
        { to: "/admin/settings", icon: Settings, label: "Settings", show: isAdmin },
        { to: "/admin/preview-as", icon: Shield, label: "Preview As", show: isAdmin },
        { to: "/admin/sync-log", icon: Activity, label: "Sync Log", show: isAdmin },
        { to: "/audit", icon: Activity, label: "Audit", show: isAdmin || isOwner },
      ],
    },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm overflow-y-auto h-[calc(100vh-2.75rem)] sticky top-11">
      <nav className="flex-1 p-3 space-y-4">
        {sections.map((section) => {
          const visibleLinks = section.links.filter((l) => l.show);
          if (visibleLinks.length === 0) return null;
          return (
            <div key={section.title}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 mb-1.5">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {visibleLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                            isActive
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`
                        }
                        end={link.to === "/"}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}