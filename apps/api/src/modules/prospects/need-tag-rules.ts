import type { GooglePlaceIntelligenceFacts } from "../visit-copilot/discovery/google-places.provider";

export const GOOGLE_NEED_RULES_VERSION = "google-rules-v1";
type Rule = { businessTypes: readonly string[]; needTag: string; service?: keyof GooglePlaceIntelligenceFacts["services"]; hasHours?: boolean; priceLevels?: readonly string[] };
export const GOOGLE_NEED_RULES: readonly Rule[] = [
  { businessTypes: ["restaurant"], service: "coffee", needTag: "restaurant-coffee" },
  { businessTypes: ["restaurant"], service: "dessert", needTag: "restaurant-dessert" },
  { businessTypes: ["restaurant"], service: "breakfast", needTag: "restaurant-breakfast" },
  { businessTypes: ["restaurant"], service: "lunch", needTag: "restaurant-meals" },
  { businessTypes: ["restaurant"], service: "dinner", needTag: "restaurant-meals" },
  { businessTypes: ["cafe", "coffee_shop"], service: "coffee", needTag: "cafe-hot-beverages" },
  // Hotel itself is a sufficient operational signal for room turnover and
  // guest hygiene; food and beverage tags still require service evidence.
  { businessTypes: ["hotel"], needTag: "hotel-housekeeping" },
  { businessTypes: ["hotel"], needTag: "hotel-hygiene" },
  { businessTypes: ["hotel"], service: "breakfast", needTag: "hotel-food-service" },
  { businessTypes: ["hotel"], service: "dineIn", needTag: "hotel-food-service" },
  { businessTypes: ["hotel"], service: "coffee", needTag: "hotel-beverages" },
  { businessTypes: ["hotel"], service: "breakfast", needTag: "hotel-beverages" },
  { businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], hasHours: true, needTag: "retail-extended-hours" },
  { businessTypes: ["restaurant", "cafe", "coffee_shop"], priceLevels: ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"], needTag: "value-service" },
];

export function deriveGoogleNeedTags(facts: GooglePlaceIntelligenceFacts): string[] {
  const type = facts.businessType ?? "";
  return [...new Set(GOOGLE_NEED_RULES.filter((rule) => rule.businessTypes.includes(type) && (rule.service === undefined || facts.services[rule.service]) && (rule.hasHours === undefined || facts.hasHours === rule.hasHours) && (rule.priceLevels === undefined || (facts.priceLevel !== null && rule.priceLevels.includes(facts.priceLevel)))).map((rule) => rule.needTag))];
}
