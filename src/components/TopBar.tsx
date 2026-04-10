import { LogOut } from "lucide-react";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AppBrand } from "@/components/AppBrand";
import { useLang } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import type { RoleTier } from "@/types/roles";

// ─── Avatar helpers ───────────────────────────────────────────────────────────

function getInitials(fullName?: string, email?: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

const AVATAR_CLS: Record<RoleTier, string> = {
  owner: "bg-amber-500 text-amber-950",
  executive: "bg-amber-400 text-amber-950",
  admin: "bg-blue-500 text-white",
  manager: "bg-violet-500 text-white",
  user: "bg-muted text-muted-foreground border border-border",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TopBar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLang();
  const { tier } = usePermissions();
  const { isPreviewMode, previewRole } = usePreviewMode();

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const initials = getInitials(fullName, user?.email);
  const avatarCls = AVATAR_CLS[tier] ?? AVATAR_CLS.user;

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-11 flex items-center gap-2">
        <AppBrand compact className="mr-auto" />

        {/* Preview mode indicator chip */}
        {isPreviewMode && (
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-2.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-amber-400 font-mono uppercase">
              {previewRole}
            </span>
          </div>
        )}

        <LanguageToggle />

        {/* Profile avatar button */}
        <button
          onClick={() => navigate("/profile")}
          title="My Profile"
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold hover:opacity-80 transition shrink-0 ${avatarCls}`}
        >
          {initials}
        </button>

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
