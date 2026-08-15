export const NEED_TAXONOMY_VERSION = "v3";
export type NeedDefinition = { tag: string; businessTypes: readonly string[]; menuTags: readonly string[]; categoryTerms: readonly string[]; productTerms: readonly string[] };
const HORECA_TYPES = ["hotel", "restaurant", "cafe", "coffee_shop", "bakery", "patisserie", "kitchen", "catering_service"] as const;

// Terms describe a business need, never an assumed company catalogue value.
// They match only values actually present in the company's Products data.
export const NEED_TAXONOMY: readonly NeedDefinition[] = [
  // Every HoReCa operation has food service and operational consumption.
  // Candidates still require a real catalogue match and are ranked by sales
  // evidence; this does not turn the full catalogue into recommendations.
  { tag: "horeca-food-service", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["food", "ingredient", "cooking", "breakfast", "meal"], productTerms: ["flour", "دقيق", "oil", "زيت", "rice", "أرز", "sauce", "صلصة", "cheese", "جبن"] },
  { tag: "horeca-beverages", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["beverage", "coffee", "tea"], productTerms: ["coffee", "قهوة", "tea", "شاي", "milk", "حليب"] },
  { tag: "horeca-sweets", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["dessert", "sweet", "bakery", "pastry"], productTerms: ["dessert", "chocolate", "sugar", "flour"] },
  { tag: "horeca-cleaning", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["cleaning", "housekeeping"], productTerms: ["cleaner", "detergent"] },
  { tag: "horeca-hygiene", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["tissue", "hygiene"], productTerms: ["tissue", "paper"] },
  { tag: "horeca-disposables", businessTypes: HORECA_TYPES, menuTags: [], categoryTerms: ["disposable", "plastic", "packaging", "paper"], productTerms: ["disposable", "plastic", "بلاستيك", "تعبئة"] },
  { tag: "retail-extended-hours", businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], menuTags: ["retail-extended-hours"], categoryTerms: ["grocery", "food", "beverage"], productTerms: [] },
  { tag: "retail-staples", businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], menuTags: [], categoryTerms: ["grocery", "food", "beverage"], productTerms: [] },
];

const NEED_TAGS = new Set(NEED_TAXONOMY.map((need) => need.tag));
export const validatedNeedTags = (tags: readonly string[]) => [...new Set(tags.filter((tag) => NEED_TAGS.has(tag)))];
