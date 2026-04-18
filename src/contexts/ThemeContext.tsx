import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** @deprecated kept for backward compat — alias of toggleTheme */
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = "app-theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  // Migrate legacy values
  if (saved === "dim") return "dark";
  if (saved === "soft-gray") return "light";
  // Fall back to system preference
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    // Remove every theme variant we have ever shipped, then apply current.
    root.classList.remove("light", "dim", "soft-gray", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Inject a one-time global transition rule for smooth theme changes.
  useEffect(() => {
    const id = "global-theme-transition";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      *, *::before, *::after {
        transition-property: background-color, border-color, color, fill, stroke, box-shadow;
        transition-duration: 320ms;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      }
      /* Don't animate transforms/opacity/anything else — keep interactions snappy. */
    `;
    document.head.appendChild(style);
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState((c) => (c === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, cycleTheme: toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
