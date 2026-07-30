import type { Fsos360Filters, Fsos360QueryInput, Fsos360RegionCityOption } from "@/lib/types";

export function regionOptions(options: Fsos360RegionCityOption[]) {
  return options.filter((option) => option.level === "region");
}

export function cityOptions(options: Fsos360RegionCityOption[], regionId: string | undefined) {
  if (!regionId) return [];
  return options.filter((option) => option.level === "city" && option.parentRegionId === regionId);
}

export function nextHierarchyFilters(previous: Fsos360Filters, key: keyof Fsos360Filters, selectedValue: string): Fsos360Filters {
  if (key === "regionIds") return { ...previous, regionIds: selectedValue ? [selectedValue] : [], cityValues: [], branchIds: [], routeIds: [], salesRepIds: [] };
  if (key === "cityValues") return { ...previous, cityValues: selectedValue ? [selectedValue] : [], branchIds: [], routeIds: [], salesRepIds: [] };
  if (key === "branchIds") return { ...previous, branchIds: selectedValue ? [selectedValue] : [], routeIds: [], salesRepIds: [] };
  return { ...previous, [key]: selectedValue ? [selectedValue] : [] };
}

export function buildFsos360QueryRequest(context: Fsos360QueryInput, userFilters: Fsos360Filters): Fsos360QueryInput {
  const filters = Object.fromEntries(Object.entries(userFilters).filter(([, value]) => typeof value === "string" ? Boolean(value) : Array.isArray(value) && value.length > 0)) as Fsos360Filters;
  return { ...context, filters };
}

export function applyRemovedSelections(previous: Fsos360Filters, removedSelections: Record<string, string[]>): Fsos360Filters {
  const next = { ...previous } as Record<string, string | string[] | undefined>;
  let changed = false;
  for (const [key, values] of Object.entries(removedSelections)) {
    const current = next[key];
    if (Array.isArray(current)) {
      const kept = current.filter((value) => !values.includes(value));
      if (kept.length !== current.length) { next[key] = kept.length ? kept : undefined; changed = true; }
    } else if (typeof current === "string" && values.includes(current)) { next[key] = undefined; changed = true; }
  }
  return changed ? next as Fsos360Filters : previous;
}