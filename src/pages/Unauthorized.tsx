import { useNavigate } from "react-router-dom";
import { ShieldOff, ArrowLeft, LayoutDashboard } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useLang } from "@/contexts/LanguageContext";

export default function Unauthorized() {
  const navigate = useNavigate();
  const { role } = usePermissions();
  const { t } = useLang();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 pb-24">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20">
          <ShieldOff className="w-7 h-7 text-red-400" />
        </div>

        <div>
          <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-1">
            {t("unauthorized", "403 Unauthorized")}
          </p>
          <h1 className="text-xl font-bold text-foreground mb-2">
            {t("permissionDenied", "Access Denied")}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">({role.replace(/_/g, " ")})</span>
          </p>
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-4 py-2 hover:bg-muted/30 transition text-muted-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("back", "Go Back")}
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:opacity-90 transition font-medium"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {t("goHome", "Dashboard")}
          </button>
        </div>
      </div>
    </div>
  );
}
