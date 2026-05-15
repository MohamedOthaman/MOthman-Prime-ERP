import { useLang } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Globe, Sun, Moon, SunMedium, MoonStar, Sparkles, Gem } from "lucide-react";

const themeIcon = {
  light: Sun,
  "soft-gray": SunMedium,
  dim: MoonStar,
  dark: Moon,
  "glass-dark": Sparkles,
  "glass-deep": MoonStar,
  "glass-light": Gem,
} as const;

const themeLabel = {
  light: "Light",
  "soft-gray": "Soft Gray",
  dim: "Dim",
  dark: "Dark",
  "glass-dark": "Glass Dark",
  "glass-deep": "Glass Deep",
  "glass-light": "Glass Light",
} as const;

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = themeIcon[theme];

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={cycleTheme}
        title={`Theme: ${themeLabel[theme]}`}
        className="flex items-center justify-center bg-secondary text-secondary-foreground h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors shrink-0"
      >
        <ThemeIcon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        title={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}
        className="flex items-center justify-center bg-secondary text-secondary-foreground h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors shrink-0"
      >
        <Globe className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
