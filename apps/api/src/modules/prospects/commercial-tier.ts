import type { GooglePlaceIntelligenceFacts } from "../visit-copilot/discovery/google-places.provider";

export type CommercialTier = "PREMIUM" | "MID_MARKET" | "VALUE";
export type CommercialTierResult = { tier: CommercialTier | null; tierConfidence: number; tierReasons: string[] };

export function deriveCommercialTier(facts: GooglePlaceIntelligenceFacts, menuInsights?: unknown): CommercialTierResult {
  const menuPosition = typeof (menuInsights as { commercialTier?: unknown })?.commercialTier === "string" ? (menuInsights as { commercialTier: string }).commercialTier.toUpperCase() : null;
  const reputation = facts.rating !== null && facts.userRatingCount !== null && facts.rating >= 4.2 && facts.userRatingCount >= 50;
  const serviceDepth = [facts.services.dineIn, facts.services.breakfast, facts.services.lunch, facts.services.dinner, facts.services.brunch, facts.services.coffee].filter(Boolean).length >= 2;
  const classify = (tier: CommercialTier, signals: [boolean, string][]): CommercialTierResult | null => {
    const reasons = signals.filter(([matched]) => matched).map(([, reason]) => reason);
    return reasons.length >= 2 ? { tier, tierConfidence: Math.min(90, 50 + reasons.length * 12), tierReasons: reasons } : null;
  };
  return classify("PREMIUM", [[facts.priceLevel === "PRICE_LEVEL_EXPENSIVE" || facts.priceLevel === "PRICE_LEVEL_VERY_EXPENSIVE", "سعر الخدمة مرتفع"], [reputation, "تقييم مرتفع بحجم مراجعات كافٍ"], [serviceDepth && facts.businessType === "hotel", "خدمات ضيافة متعددة"], [menuPosition === "PREMIUM", "إشارة تسعير من تحليل القائمة"]])
    ?? classify("VALUE", [[facts.priceLevel === "PRICE_LEVEL_INEXPENSIVE", "سعر الخدمة اقتصادي"], [facts.services.takeout || facts.services.delivery, "نموذج خدمة سريع/اقتصادي"], [reputation, "تقييم جيد بحجم مراجعات كافٍ"], [menuPosition === "VALUE", "إشارة قيمة من تحليل القائمة"]])
    ?? classify("MID_MARKET", [[facts.priceLevel === "PRICE_LEVEL_MODERATE", "سعر الخدمة متوسط"], [reputation, "تقييم جيد بحجم مراجعات كافٍ"], [facts.hasHours || serviceDepth, "تشغيل أو خدمات معلنة"], [menuPosition === "MID_MARKET", "إشارة تسعير من تحليل القائمة"]])
    ?? { tier: null, tierConfidence: 0, tierReasons: [] };
}
