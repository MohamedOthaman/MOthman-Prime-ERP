import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "light" | "soft-gray" | "dim" | "dark" | "glass-dark" | "glass-deep" | "glass-light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_ORDER: Theme[] = ["light", "soft-gray", "dim", "dark", "glass-dark", "glass-deep", "glass-light"];

const ALL_THEMES = ["light", "dim", "soft-gray", "dark", "glass-dark", "glass-deep", "glass-light"] as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("app-theme");
    if (ALL_THEMES.includes(saved as Theme)) {
      return saved as Theme;
    }
    return "light";
  });

  // Apply saved theme class on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEMES);
    root.classList.add(theme);
    localStorage.setItem("app-theme", theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = (t: Theme) => {
    const commit = () => {
      const root = document.documentElement;
      root.classList.remove(...ALL_THEMES);
      root.classList.add(t);
      localStorage.setItem("app-theme", t);
      setThemeState(t);
    };

    if ((document as unknown as { startViewTransition?: (cb: () => void) => void }).startViewTransition) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(commit);
    } else {
      const root = document.documentElement;
      root.classList.add("theme-transitioning");
      commit();
      setTimeout(() => root.classList.remove("theme-transitioning"), 600);
    }
  };

  const cycleTheme = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
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
