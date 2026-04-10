import { useState } from "react";
import { useAuth } from "@/features/reports/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LanguageContext";
import { AppBrand } from "@/components/AppBrand";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const { t } = useLang();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(t("checkEmail"));
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <AppBrand className="justify-center text-left" showDeveloperCredit />
          <p className="text-sm text-muted-foreground">
            {isSignUp ? t("signUpTitle") : t("signInTitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSignUp && (
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={t("fullName")}
              required
              className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("email")}
            required
            className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t("password")}
            required
            minLength={6}
            className="w-full bg-secondary text-foreground text-sm rounded-md px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSignUp ? t("signUpBtn") : t("signInBtn")}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSignUp ? t("alreadyHaveAccount") : t("needAccount")}
        </button>
      </div>
    </div>
  );
}
