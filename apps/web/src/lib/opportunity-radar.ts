import type { OpportunityRadarItem } from "./api/opportunity-radar";

export const OPPORTUNITY_TYPE_LABELS = {
  PURCHASE: "شراء معلن",
  EVENT: "فعاليات وفرص قريبة",
  PROACTIVE: "فرص استباقية",
} as const;

export const COMPANY_OPPORTUNITY_STATUS_LABELS = {
  NEW: "جديدة",
  REVIEWED: "تمت المراجعة",
  CONTACTED: "تم التواصل",
  QUALIFIED: "مؤهلة",
  WON: "تم الفوز",
  LOST: "لم تُكسب",
  EXPIRED: "منتهية",
} as const;

export const CONFIDENCE_LABELS = { HIGH: "عالية", MEDIUM: "متوسطة", LOW: "منخفضة" } as const;
export const MARKET_STATUS_LABELS = { OPEN: "مفتوحة", CLOSED: "مغلقة", EXPIRED: "منتهية" } as const;

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function eventProximity(opportunityDate: string | null, now = new Date()): { label: string; urgent: boolean } | null {
  if (!opportunityDate) return null;
  const days = Math.ceil((new Date(opportunityDate).getTime() - now.getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0 || days > 14) return null;
  return days <= 7 ? { label: "الفعالية خلال 7 أيام", urgent: true } : { label: "الفعالية خلال 14 يومًا", urgent: false };
}

export function opportunityLocation(item: OpportunityRadarItem): string {
  const market = item.marketOpportunity;
  return [market.city, market.region, market.country].filter(Boolean).join("، ");
}

export function opportunityMapLocation(item: OpportunityRadarItem): { label: string; href: string | null; precise: boolean } {
  const market = item.marketOpportunity;
  const providedMapUrl = safeExternalUrl(market.mapUrl);
  const searchOnly = market.locationKind === "SEARCH_ONLY" || market.mapLinkKind?.toLowerCase().includes("search");
  const preciseLocation = market.location?.trim();
  const context = [market.city, market.region, market.country].filter((value): value is string => !!value?.trim());
  if (providedMapUrl) return { label: market.venueName?.trim() || preciseLocation || context.join("، "), href: providedMapUrl, precise: !searchOnly && market.locationKind === "PRECISE" };
  if (!preciseLocation) return { label: context.join("، "), href: null, precise: false };
  const query = [preciseLocation, ...context].join(", ");
  return {
    label: preciseLocation,
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    precise: market.locationKind == null || market.locationKind === "PRECISE",
  };
}

export function primaryContact(item: OpportunityRadarItem): { label: string; value: string; href: string } | null {
  const market = item.marketOpportunity;
  if (market.whatsapp) return { label: "واتساب معلن", value: market.whatsapp, href: `https://wa.me/${market.whatsapp.replace(/\D/g, "")}` };
  if (market.email) return { label: "بريد جهة التواصل", value: market.email, href: `mailto:${market.email}` };
  if (market.phone) return { label: "هاتف عام معلن", value: market.phone, href: `tel:${market.phone}` };
  const contactUrl = safeExternalUrl(market.contactUrl);
  if (contactUrl) return { label: "صفحة التواصل", value: "فتح صفحة التواصل", href: contactUrl };
  return null;
}
