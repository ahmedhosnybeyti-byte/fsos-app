export const CATALOG_FIT_VERSION = "v1";

export type CatalogFamily = "SNACKS" | "CONFECTIONERY" | "DETERGENTS" | "DRY_FOOD" | "MIXED";
export type CatalogFamilyDefinition = {
  family: CatalogFamily;
  outletTypes: readonly string[];
  needTags: readonly string[];
  // Tenant catalogue labels are deliberately empty until explicitly configured.
  companyCategories: readonly string[];
};

// Typed configuration only; it never assumes a company's category names.
export const CATALOG_FAMILY_REGISTRY: readonly CatalogFamilyDefinition[] = [
  { family: "SNACKS", outletTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], needTags: [], companyCategories: [] },
  { family: "CONFECTIONERY", outletTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], needTags: [], companyCategories: [] },
  { family: "DETERGENTS", outletTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], needTags: [], companyCategories: [] },
  { family: "DRY_FOOD", outletTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], needTags: [], companyCategories: [] },
  { family: "MIXED", outletTypes: ["grocery_store", "convenience_store", "supermarket", "hypermarket"], needTags: [], companyCategories: [] },
];

export const RETAIL_OUTLET_TYPES = new Set(CATALOG_FAMILY_REGISTRY.flatMap((family) => family.outletTypes));
