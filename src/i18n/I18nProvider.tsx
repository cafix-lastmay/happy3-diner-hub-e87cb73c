// Bilingual i18n (EN/AR) with RTL support, persisted in localStorage.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ar } from "./ar";
import { en } from "./en";

export type Lang = "ar" | "en";
type Dict = typeof ar;

const dicts: Record<Lang, Dict> = { ar, en };
const isLang = (value: unknown): value is Lang => value === "ar" || value === "en";

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const I18nContext = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with "ar" so SSR and the initial client render match.
  // localStorage is read AFTER hydration to avoid mismatch crashes.
  const [lang, setLangState] = useState<Lang>("ar");

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("lang") : null;
    if (isLang(stored) && stored !== lang) setLangState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = dir;
    }
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  const t = (key: string): string => {
    const dict = (dicts[lang] ?? dicts.ar) as Record<string, string>;
    return dict[key] ?? (dicts.en as Record<string, string>)[key] ?? key;
  };

  return <I18nContext.Provider value={{ lang, setLang, t, dir }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
