import { Package, ShoppingCart, Camera, FileSpreadsheet, BarChart3, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { path: "/", icon: Package, label: "Stock" },
  { path: "/sale", icon: ShoppingCart, label: "Sale" },
  { path: "/scan-invoice", icon: Camera, label: "AI Scan" },
  { path: "/import-export", icon: FileSpreadsheet, label: "IO" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/products", icon: Settings, label: "Products" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

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
