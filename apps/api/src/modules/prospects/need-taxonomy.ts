export const NEED_TAXONOMY_VERSION = "v2";
export type NeedDefinition = { tag: string; businessTypes: readonly string[]; menuTags: readonly string[]; categoryTerms: readonly string[]; productTerms: readonly string[] };

// Terms describe a business need, never an assumed company catalogue value.
// They match only values actually present in the company's Products data.
export const NEED_TAXONOMY: readonly NeedDefinition[] = [
  { tag: "restaurant-food-service", businessTypes: ["restaurant"], menuTags: [], categoryTerms: ["food", "ingredient", "cooking"], productTerms: ["flour", "دقيق", "oil", "زيت", "rice", "أرز", "sauce", "صلصة", "cheese", "جبن"] },
  { tag: "restaurant-coffee", businessTypes: ["restaurant"], menuTags: ["restaurant-coffee"], categoryTerms: ["coffee", "beverage"], productTerms: ["coffee"] },
  { tag: "restaurant-dessert", businessTypes: ["restaurant"], menuTags: ["restaurant-dessert"], categoryTerms: ["dessert", "sweet"], productTerms: ["dessert", "chocolate"] },
  { tag: "restaurant-breakfast", businessTypes: ["restaurant"], menuTags: ["restaurant-breakfast"], categoryTerms: ["breakfast", "dairy"], productTerms: [] },
  { tag: "restaurant-meals", businessTypes: ["restaurant"], menuTags: ["restaurant-meals"], categoryTerms: ["food", "meal"], productTerms: [] },
  { tag: "retail-extended-hours", businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], menuTags: ["retail-extended-hours"], categoryTerms: ["grocery", "food", "beverage"], productTerms: [] },
  // A hotel is a broad HoReCa operation: guest rooms, housekeeping, dining,
  // breakfast, and coffee service all create legitimate FMCG demand.
  { tag: "hotel-housekeeping", businessTypes: ["hotel"], menuTags: [], categoryTerms: ["cleaning", "housekeeping"], productTerms: ["cleaner", "detergent"] },
  { tag: "hotel-hygiene", businessTypes: ["hotel"], menuTags: [], categoryTerms: ["tissue", "hygiene"], productTerms: ["tissue", "paper"] },
  { tag: "hotel-food-service", businessTypes: ["hotel"], menuTags: [], categoryTerms: ["food", "ingredient", "cooking", "breakfast", "meal"], productTerms: ["flour", "دقيق", "oil", "زيت", "rice", "أرز", "sauce", "صلصة", "cheese", "جبن"] },
  { tag: "hotel-beverages", businessTypes: ["hotel"], menuTags: [], categoryTerms: ["beverage", "coffee", "tea"], productTerms: ["coffee", "قهوة", "tea", "شاي", "milk", "حليب"] },
  { tag: "hotel-disposables", businessTypes: ["hotel"], menuTags: [], categoryTerms: ["disposable", "plastic", "packaging", "paper"], productTerms: ["disposable", "plastic", "بلاستيك", "تعبئة"] },
  { tag: "pizza-cheese", businessTypes: ["restaurant"], menuTags: ["pizza"], categoryTerms: ["cheese", "dairy"], productTerms: ["cheese", "mozzarella"] },
  { tag: "pizza-sauces", businessTypes: ["restaurant"], menuTags: ["pizza"], categoryTerms: ["sauce", "condiment"], productTerms: ["sauce", "tomato"] },
  { tag: "cafe-hot-beverages", businessTypes: ["cafe", "coffee_shop"], menuTags: [], categoryTerms: ["coffee", "beverage", "tea"], productTerms: ["coffee", "قهوة", "tea", "شاي", "milk", "حليب"] },
  { tag: "bakery-ingredients", businessTypes: ["bakery"], menuTags: ["bakery", "pastry"], categoryTerms: ["baking", "ingredients"], productTerms: ["flour", "sugar", "chocolate"] },
  { tag: "retail-staples", businessTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], menuTags: [], categoryTerms: ["grocery", "food", "beverage"], productTerms: [] },
];

const NEED_TAGS = new Set(NEED_TAXONOMY.map((need) => need.tag));
export const validatedNeedTags = (tags: readonly string[]) => [...new Set(tags.filter((tag) => NEED_TAGS.has(tag)))];
