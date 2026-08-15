import type { GooglePlaceIntelligenceFacts } from "../visit-copilot/discovery/google-places.provider";

export const GOOGLE_NEED_RULES_VERSION = "google-rules-v1";
type Rule = { businessTypes: readonly string[]; needTag: string; service?: keyof GooglePlaceIntelligenceFacts["services"]; hasHours?: boolean; priceLevels?: readonly string[] };
export const GOOGLE_NEED_RULES: readonly Rule[] = [
  { businessTypes: ["restaurant"], service: "coffee", needTag: "horeca-beverages" },
  { businessTypes: ["restaurant"], service: "dessert", needTag: "horeca-sweets" },
  { businessTypes: ["restaurant"], service: "breakfast", needTag: "horeca-food-service" },
  { businessTypes: ["restaurant"], service: "lunch", needTag: "horeca-food-service" },
  { businessTypes: ["restaurant"], service: "dinner", needTag: "horeca-food-service" },
  { businessTypes: ["cafe", "coffee_shop"], service: "coffee", needTag: "horeca-beverages" },
  // Hotel itself is a sufficient operational signal for room turnover and
  // guest hygiene; food and beverage tags still require service evidence.
  { businessTypes: ["hotel"], needTag: "horeca-cleaning" },
  { businessTypes: ["hotel"], needTag: "horeca-hygiene" },
  { businessTypes: ["hotel"], service: "breakfast", needTag: "horeca-food-service" },
  { businessTypes: ["hotel"], service: "dineIn", needTag: "horeca-food-service" },
  { businessTypes: ["hotel"], service: "coffee", needTag: "horeca-beverages" },
  { businessTypes: ["hotel"], service: "breakfast", needTag: "horeca-beverages" },
  { businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], hasHours: true, needTag: "retail-extended-hours" },
  { businessTypes: ["restaurant", "cafe", "coffee_shop", "bakery", "catering_service"], priceLevels: ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"], needTag: "horeca-food-service" },
];

export function deriveGoogleNeedTags(facts: GooglePlaceIntelligenceFacts): string[] {
  const type = facts.businessType ?? "";
  return [...new Set(GOOGLE_NEED_RULES.filter((rule) => rule.businessTypes.includes(type) && (rule.service === undefined || facts.services[rule.service]) && (rule.hasHours === undefined || facts.hasHours === rule.hasHours) && (rule.priceLevels === undefined || (facts.priceLevel !== null && rule.priceLevels.includes(facts.priceLevel)))).map((rule) => rule.needTag))];
}
