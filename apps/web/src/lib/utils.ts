import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function activeLocale() {
  return typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar-SA" : "en-US";
}

export function formatDate(value: string | Date, locale = activeLocale()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function formatMoneyCents(cents: number, currency = "USD", locale = activeLocale()): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

const quantityFormatters = {
  ar: new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};
const quantityInputFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

/** Formats operational quantities consistently across Smart Loading. */
export function formatQuantity(value: number, locale: "ar" | "en" = "ar"): string {
  return quantityFormatters[locale].format(Number.isFinite(value) ? value : 0);
}

/** Keeps editable number inputs valid while matching the one-decimal display contract. */
export function formatQuantityInput(value: number): string {
  return quantityInputFormatter.format(Number.isFinite(value) ? value : 0);
}
