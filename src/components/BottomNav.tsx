import {
  Package,
  ScanLine,
  FileSpreadsheet,
  BarChart3,
  Settings,
  UserSquare2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";
import { useRole } from "@/features/reports/hooks/useRole";

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();
  const { canManageStock, isAdmin, isSalesManager } = useRole();

  const tabs = [
    { path: "/", icon: Package, label: t("stock") },
    { path: "/invoice-scan", icon: ScanLine, label: t("invoices") },
    { path: "/import-export", icon: FileSpreadsheet, label: t("io") },
    { path: "/reports", icon: BarChart3, label: t("reports") },

    ...(canManageStock
      ? [{ path: "/products", icon: Package, label: t("productsNav") }]
      : []),

    ...((isAdmin || isSalesManager)
      ? [{ path: "/salesmen", icon: UserSquare2, label: "Salesmen" }]
      : []),

    ...(isAdmin
      ? [{ path: "/admin/users", icon: Settings, label: "Admin" }]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur">
      <div className="grid grid-cols-6 items-center">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          const Icon = tab.icon;

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-xs ${active ? "text-primary" : "text-muted-foreground"
                }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}