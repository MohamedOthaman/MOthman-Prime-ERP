import { createContext, useCallback, useContext, useEffect, useMemo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  LANG_STORAGE_KEY,
  type SupportedLanguage,
  directionFor,
  isSupportedLanguage,
} from "@/i18n/config";

type Lang = SupportedLanguage;

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * Translate a key. Accepts either a flat key (resolved in the `common`
   * namespace) or a namespaced key in `ns:key.path` form. Returns the key
   * itself if no translation is found — backwards-compatible with the prior
   * inline translation system.
   */
  t: (key: string, fallback?: string) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function normalizeLang(value: string | undefined): Lang {
  if (!value) return DEFAULT_LANGUAGE;
  const base = value.split("-")[0];
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { t: i18nT, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const dir = directionFor(lang);

  // Keep <html lang> and <html dir> in sync with the active language.
  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute("lang") !== lang) root.setAttribute("lang", lang);
    if (root.getAttribute("dir") !== dir) root.setAttribute("dir", dir);
  }, [lang, dir]);

  const setLang = useCallback(
    (l: Lang) => {
      void i18n.changeLanguage(l);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, l);
      } catch {
        // localStorage may be unavailable (private mode); detection cache will repopulate later.
      }
    },
    [i18n],
  );

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const result = i18nT(key, { defaultValue: fallback ?? key });
      return typeof result === "string" ? result : String(result);
    },
    [i18nT],
  );

  const value = useMemo<LanguageContextType>(
    () => ({ lang, setLang, t, dir }),
    [lang, setLang, t, dir],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be inside LanguageProvider");
  return ctx;
}
