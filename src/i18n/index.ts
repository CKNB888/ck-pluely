import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";

export const UI_LANGUAGE_STORAGE_KEY = "pluely-ui-language";

export const SUPPORTED_UI_LANGUAGES = [
  { id: "system", name: "System default" },
  { id: "en", name: "English" },
  { id: "zh-CN", name: "简体中文" },
] as const;

const resolveSystemLanguage = (): string => {
  const langs =
    typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : [];
  for (const lang of langs) {
    if (lang?.toLowerCase().startsWith("zh")) return "zh-CN";
    if (lang?.toLowerCase().startsWith("en")) return "en";
  }
  // ck-pluely: Chinese-first — unknown system language falls back to zh-CN.
  return "zh-CN";
};

export const getStoredUiLanguage = (): string => {
  try {
    // ck-pluely: Simplified Chinese on first launch, whatever the OS locale.
    return localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || "zh-CN";
  } catch {
    return "zh-CN";
  }
};

const resolveLanguage = (pref: string) =>
  pref === "system" ? resolveSystemLanguage() : pref;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: resolveLanguage(getStoredUiLanguage()),
  fallbackLng: "zh-CN",
  // Keys are the English source strings themselves.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
  });
}

// Keep all windows (overlay + dashboard) in sync when the preference changes.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === UI_LANGUAGE_STORAGE_KEY) {
      i18n.changeLanguage(resolveLanguage(e.newValue || "zh-CN"));
    }
  });
}

export const setUiLanguage = (pref: string) => {
  try {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, pref);
  } catch {
    // ignore storage failures
  }
  return i18n.changeLanguage(resolveLanguage(pref));
};

/** Translate a UI string. The key is the English source text. */
export const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never));

export default i18n;
