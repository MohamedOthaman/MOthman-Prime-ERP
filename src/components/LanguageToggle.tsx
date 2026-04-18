import { useLang } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Globe, Sun, Moon } from "lucide-react";

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={toggleTheme}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
        className="flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground h-7 w-[78px] rounded-md text-xs font-semibold border border-border hover:bg-muted transition-colors"
      >
        {isDark ? (
          <>
            <Sun className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Light</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Dark</span>
          </>
        )}
      </button>
      <button
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        className="flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground h-7 w-[72px] rounded-md text-xs font-semibold border border-border hover:bg-muted transition-colors"
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{lang === "en" ? "عربي" : "EN"}</span>
      </button>
    </div>
  );
}
