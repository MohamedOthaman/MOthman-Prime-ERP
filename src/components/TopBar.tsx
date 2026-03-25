import { LogOut } from "lucide-react";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLang } from "@/contexts/LanguageContext";

export function TopBar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLang();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-11 flex items-center gap-2">
        {/* App title */}
        <span className="text-sm font-bold text-foreground tracking-tight mr-auto">
          {t("warehouseErp")}
        </span>

        {/* Global controls */}
        <LanguageToggle />

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs font-semibold border border-border hover:bg-destructive/15 hover:text-destructive hover:border-destructive/30 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("logout")}</span>
        </button>
      </div>
    </header>
  );
}
