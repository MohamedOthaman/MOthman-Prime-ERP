import { useLang } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Globe, Sun, Moon, SunMedium, MoonStar, Sparkles, Gem } from "lucide-react";

const themeIcon = {
  light: Sun,
  "soft-gray": SunMedium,
  dim: MoonStar,
  dark: Moon,
  "glass-dark": Sparkles,
  "glass-light": Gem,
} as const;

const themeLabel = {
  light: "Light",
  "soft-gray": "Gray",
  dim: "Dim",
  dark: "Dark",
  "glass-dark": "Glass",
  "glass-light": "Crystal",
} as const;

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const { theme, cycleTheme } = useTheme();
  const ThemeIcon = themeIcon[theme];

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={cycleTheme}
        title={`Theme: ${themeLabel[theme]}`}
        className="flex items-center justify-center gap-1.5 bg-secondary text-secondary-foreground h-7 w-[88px] rounded-md text-xs font-semibold border border-border hover:bg-muted transition-colors"
      >
        <ThemeIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{themeLabel[theme]}</span>
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
