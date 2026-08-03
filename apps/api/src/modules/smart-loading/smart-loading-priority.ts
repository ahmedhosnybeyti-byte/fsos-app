export type RoutePriorityCandidate = {
  productCode: string;
  productName: string;
  category: string | null;
  routeCustomerCount: number;
  totalQuantity: number;
  currentVehicleStock: number | null;
};

/** Ranks only sales already scoped to the selected route's customers. */
export function selectRoutePriorityProducts(candidates: readonly RoutePriorityCandidate[]): RoutePriorityCandidate[] {
  const groups = new Map<string, RoutePriorityCandidate[]>();
  for (const candidate of candidates) {
    const category = candidate.category ?? "";
    const group = groups.get(category) ?? [];
    group.push(candidate);
    groups.set(category, group);
  }
  const selected: RoutePriorityCandidate[] = [];
  for (const category of [...groups.keys()].sort((a, b) => a.localeCompare(b, "ar"))) {
    const ranked = [...groups.get(category)!].sort((a, b) => b.routeCustomerCount - a.routeCustomerCount || b.totalQuantity - a.totalQuantity || a.productName.localeCompare(b.productName, "ar"));
    selected.push(...ranked.slice(0, 5));
  }
  return selected;
}