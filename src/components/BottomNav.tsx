import { Package, ScanLine, FileSpreadsheet, BarChart3, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLang } from "@/contexts/LanguageContext";

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();

  const tabs = [
    { path: "/", icon: Package, label: t("stock") },
    { path: "/invoice-scan", icon: ScanLine, label: t("invoices") },
    { path: "/import-export", icon: FileSpreadsheet, label: t("io") },
    { path: "/reports", icon: BarChart3, label: t("reports") },
    { path: "/products", icon: Settings, label: t("productsNav") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-nav-bg border-t border-border">
      <div className="max-w-3xl mx-auto flex">
        {tabs.map(tab => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                active ? "text-nav-active" : "text-nav-inactive"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
