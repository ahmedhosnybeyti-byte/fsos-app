export const SMART_LOADING_STALE_DAYS = 4;

export type SalesRecency = "recent" | "stale" | "missing";

function validSaleTime(lastSaleDate: string | null): number | null {
  if (!lastSaleDate) return null;
  const time = new Date(lastSaleDate).getTime();
  return Number.isNaN(time) ? null : time;
}

export function classifySalesRecency(lastSaleDate: string | null, now = new Date()): SalesRecency {
  const saleTime = validSaleTime(lastSaleDate);
  if (saleTime === null) return "missing";
  return Math.floor((now.getTime() - saleTime) / 86_400_000) > SMART_LOADING_STALE_DAYS ? "stale" : "recent";
}

export function summarizeSalesRecency<T extends { lastSaleDate: string | null }>(products: readonly T[], now = new Date()) {
  return products.reduce(
    (summary, product) => {
      summary[classifySalesRecency(product.lastSaleDate, now)] += 1;
      return summary;
    },
    { recent: 0, stale: 0, missing: 0 },
  );
}
