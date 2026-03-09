import { useLang } from "@/contexts/LanguageContext";
import { Globe } from "lucide-react";

export function LanguageToggle() {
  const { lang, setLang } = useLang();

  return (
    <button
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs font-semibold border border-border hover:bg-muted transition-colors"
    >
      <Globe className="w-3.5 h-3.5" />
      {lang === "en" ? "عربي" : "EN"}
    </button>
  );
}
