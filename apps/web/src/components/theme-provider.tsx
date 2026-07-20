"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Keep in sync with the inline blocking script in app/layout.tsx (THEME_INIT_SCRIPT),
// which sets the "dark" class on <html> before first paint to avoid a flash.
const STORAGE_KEY = "fsos-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default matches the inline script's fallback; corrected from localStorage/
  // system preference on mount (see effect below) — the class on <html> is
  // already correct before hydration, this just syncs React state to it.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const alreadyDark = document.documentElement.classList.contains("dark");
    setThemeState(alreadyDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
