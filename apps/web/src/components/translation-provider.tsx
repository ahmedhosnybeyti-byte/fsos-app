"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

interface TranslationContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  // params supports simple `{placeholder}` interpolation in dictionary
  // values, e.g. dictionaries.ts's "customerSimilarity.customersBadge":
  // "{count} عميل" + t(key, { count: 12 }).
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

// Keep in sync with the inline blocking script in app/layout.tsx
// (LOCALE_INIT_SCRIPT), which sets lang/dir on <html> before first paint.
// Per-device only for now (localStorage) — not saved to the user's account,
// so it resets on a new device/browser. Upgrading to an account-level
// preference needs a User table migration; deliberately not done here
// without an explicit go-ahead (see PROJECT_LOG.md).
const STORAGE_KEY = "fsos-locale";

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const t = useMemo(() => {
    const dict = dictionaries[locale];
    return (key: TranslationKey, params?: Record<string, string | number>) => {
      const raw = dict[key] ?? dictionaries.ar[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (_match, token: string) => String(params[token] ?? ""));
    };
  }, [locale]);

  const value = useMemo<TranslationContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((prev) => (prev === "ar" ? "en" : "ar")),
      t,
    }),
    [locale, t],
  );

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error("useTranslation must be used within TranslationProvider");
  return ctx;
}
