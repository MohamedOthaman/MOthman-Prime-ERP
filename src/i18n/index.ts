import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import {
  DEFAULT_LANGUAGE,
  DEFAULT_NAMESPACE,
  LANG_STORAGE_KEY,
  NAMESPACES,
  SUPPORTED_LANGUAGES,
} from "./config";

import enCommon from "./locales/en/common.json";
import enSidebar from "./locales/en/sidebar.json";
import arCommon from "./locales/ar/common.json";
import arSidebar from "./locales/ar/sidebar.json";

const resources = {
  en: { common: enCommon, sidebar: enSidebar },
  ar: { common: arCommon, sidebar: arSidebar },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    ns: NAMESPACES as unknown as string[],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    nsSeparator: ":",
    keySeparator: ".",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ["localStorage"],
    },
    returnNull: false,
    react: { useSuspense: false },
  });

export default i18n;
