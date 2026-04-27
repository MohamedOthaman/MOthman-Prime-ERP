import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "light" | "soft-gray" | "dim" | "dark" | "glass-dark" | "glass-light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_ORDER: Theme[] = ["light", "soft-gray", "dim", "dark", "glass-dark", "glass-light"];

const ALL_THEMES = ["light", "dim", "soft-gray", "dark", "glass-dark", "glass-light"] as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("app-theme");
    if (ALL_THEMES.includes(saved as Theme)) {
      return saved as Theme;
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEMES);
    root.classList.add(theme);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setThemeState(t);
    setTimeout(() => root.classList.remove("theme-transitioning"), 600);
  };

  const cycleTheme = () => {
    setThemeState((current) => {
      const idx = THEME_ORDER.indexOf(current);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setTimeout(() => root.classList.remove("theme-transitioning"), 600);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
