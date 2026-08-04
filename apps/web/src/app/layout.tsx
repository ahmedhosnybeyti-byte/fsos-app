import type { Metadata, Viewport } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "@/components/theme-provider";
import { TranslationProvider } from "@/components/translation-provider";

// Arabic-optimized font — replaces the previous Latin-only Inter. The app's
// UI copy is Arabic-first everywhere; Cairo covers both the "arabic" and
// "latin" subsets so English fragments (emails, SKU codes, etc.) still
// render cleanly. Exposed as --font-sans so tailwind.config.ts's existing
// fontFamily.sans mapping picks it up with no other changes needed.
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-sans", display: "swap" });

// 2026-07-29 — explicit request: "ملخص اليوم 360°" specifically (not the
// whole app) should read like the ChatGPT reference report's typography —
// a plainer, more neutral editorial sans instead of Cairo's rounder,
// more geometric letterforms. IBM Plex Sans Arabic is the closest widely-
// available match to that "report" feel. Scoped via its own CSS variable
// (--font-report) rather than replacing --font-sans, so every other screen
// keeps Cairo untouched — only daily-360-summary-modal.tsx opts in.
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-report",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 0.9,
  minimumScale: 0.5,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: {
    default: "مرشدك | Murshidak",
    template: "%s | مرشدك",
  },
  description: "منصة الذكاء الاصطناعي التنفيذية لإدارة المبيعات الميدانية في شركات السلع الاستهلاكية سريعة الحركة.",
};

// Blocking inline scripts: run before first paint so there's no flash of
// the wrong theme or the wrong text direction. Mirror components/
// theme-provider.tsx and components/translation-provider.tsx's storage
// keys/fallback logic exactly.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('fsos-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;
const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('fsos-locale');if(l==='ar'||l==='en'){document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${ibmPlexSansArabic.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <TranslationProvider>
            <Providers>{children}</Providers>
          </TranslationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
