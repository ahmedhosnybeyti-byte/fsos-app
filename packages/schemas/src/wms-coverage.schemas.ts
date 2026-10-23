export type WmsCoverageRisk = "CRITICAL" | "WATCH" | "SAFE" | "UNKNOWN";
export interface WmsCoverageRow {
  id: string; code: string; name: string; baseUnit: string; piecesPerCarton?: number;
  available: string; reserved: string; quarantined: string;
  dailyDemand: string | null; daysOfCover: string | null;
  demandDays: number; firstSale: string | null; lastSale: string | null;
  risk: WmsCoverageRisk; reason: "LOW" | "MONITOR" | "SUFFICIENT" | "HISTORY" | "UOM";
  leadTimeDays: number | null; purchaseReference: string | null;
}
export interface WmsCoverageResult {
  items: WmsCoverageRow[]; page: number; hasMore: boolean;
  from: string; to: string; stockAsOf: string;
}
