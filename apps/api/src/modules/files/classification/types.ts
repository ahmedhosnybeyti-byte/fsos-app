export interface CandidateScore {
  datasetType: string;
  confidence: number; // 0-100
}

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
  candidates: CandidateScore[]; // sorted descending, top few
  detected: DetectedMetadata;
  columns: ColumnMetadata[];
}

export interface WorkbookClassification {
  sheets: SheetClassification[];
  primarySheetIndex: number;
  // True when 2+ sheets each have a confident (>=70) top candidate AND
  // those top candidates disagree — this workbook holds more than one
  // business dataset and must never be silently classified as one thing.
  isMixed: boolean;
}
