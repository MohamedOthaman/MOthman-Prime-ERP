import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";

export default function ResetPasswordPage() {
  const { t } = useLang();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event which fires when Supabase
    // processes the recovery token from the URL hash (#access_token=...&type=recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setChecking(false);
      }
    });

    // Also check if there's already a valid session (e.g. page was refreshed after recovery)
    const checkExisting = async () => {
      // Give Supabase a moment to process the hash fragment
      await new Promise((r) => setTimeout(r, 1000));

      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setChecking(false);
      } else {
        // If still no session after waiting, the link is invalid/expired
        toast.error("Invalid or expired reset link");
        navigate("/auth");
      }
    };

    checkExisting();

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error("Please fill all fields");
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }

    if (password.length < 6) {
      toast.error(t("passwordLength"));
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(t("resetSuccess"));
    setTimeout(() => navigate("/auth"), 1500);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form
        onSubmit={handleResetPassword}
        className="w-full max-w-sm space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {t("resetPasswordTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("resetPasswordDesc")}
          </p>
        </div>

        <input
          type="password"
          placeholder={t("newPassword")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />

        <input
          type="password"
          placeholder={t("confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? t("resettingBtn") : t("resetPasswordBtn")}
        </button>
      </form>
    </div>
  );
}