import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "light" | "soft-gray" | "dim" | "dark" | "glass-light" | "glass-dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_ORDER: Theme[] = ["light", "soft-gray", "dim", "dark", "glass-light", "glass-dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("app-theme");
    if (
      saved === "light" ||
      saved === "dim" ||
      saved === "soft-gray" ||
      saved === "dark" ||
      saved === "glass-light" ||
      saved === "glass-dark"
    ) {
      return saved as Theme;
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    root.classList.remove("light", "dim", "soft-gray", "dark", "glass-light", "glass-dark");
    // Add current theme class
    root.classList.add(theme);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const cycleTheme = () => {
    setThemeState((current) => {
      const idx = THEME_ORDER.indexOf(current);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
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
