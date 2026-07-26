export interface DetectedMetadata {
  period?: { from: string; to: string };
  region?: string[];
  branch?: string[];
  salesRep?: string[];
  route?: string[];
}

export type ColumnType = "numeric" | "date" | "boolean" | "text" | "empty";

export interface ColumnMetadata {
  name: string;
  type: ColumnType;
  nullable: boolean; // at least one sampled row had a blank cell in this column
  min?: number | string; // numeric columns: number. date columns: ISO date (YYYY-MM-DD).
  max?: number | string;
  // Only present when this column's sampled values have low cardinality —
  // gives the model exact valid values to filter on (real casing/spelling)
  // instead of guessing, for ANY column (not just the named Smart Metadata
  // fields below), e.g. a "Status" or "PaymentMethod" column.
  distinctValues?: string[];
}

export interface SheetClassification {
  sheetIndex: number;
  sheetName: string;
  headers: string[];
  rowCount: number;
  detected: DetectedMetadata;
  columns: ColumnMetadata[];
}

// 2026-07-26 — dropped the confidence-scored `candidates`/`primarySheetIndex`/
// `isMixed` fields that used to live here. Confirmed dead post-ADR-002: sheet
// dataset-type selection has run entirely through ImportTemplateMatcherService
// (strict sheet-name/column matching) for a while now, and nothing else —
// not the Files UI, not the GPT Action, not the native Assistant — ever read
// these fields; they were computed on every upload and never consulted.
export interface WorkbookClassification {
  sheets: SheetClassification[];
}
