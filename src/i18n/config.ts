export const SUPPORTED_LANGUAGES = ["en", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANG_STORAGE_KEY = "app-lang";

export const NAMESPACES = ["common", "sidebar"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NAMESPACE: Namespace = "common";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function directionFor(lang: SupportedLanguage): "ltr" | "rtl" {
  return lang === "ar" ? "rtl" : "ltr";
}
