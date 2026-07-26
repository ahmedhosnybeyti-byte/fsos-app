import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { METADATA_FIELD_ALIASES } from "./dataset-classification-rules";
import type { ColumnMetadata, ColumnType, DetectedMetadata, SheetClassification, WorkbookClassification } from "./types";

// 2026-07-26 — this used to also hold METADATA_SCAN_ROW_CAP=2000, shared
// between two very different jobs: (1) scoreCandidates()'s confidence-based
// dataset-TYPE guessing, and (2) the accuracy-critical Smart Metadata
// (detected date period, region/branch/rep distinct values, per-column
// min/max). Both are now gone/fixed: job (1) — scoreCandidates,
// analyzeColumnShapes, detectMixed, and the candidates/primarySheetIndex/
// isMixed fields — was confirmed fully vestigial post-ADR-002 (sheet
// dataset-type has run entirely through ImportTemplateMatcherService's
// strict sheet-name/column matching for a while; nothing ever read the
// confidence guess) and has been removed outright. Job (2) kept its own,
// much higher cap below — reusing the type-classification sample size for
// an accuracy computation was the actual bug (a 2,150-row Invoices file had
// its tail silently dropped from the detected date range).
const METADATA_ACCURACY_ROW_CAP = 200_000;
const DISTINCT_VALUE_CAP = 8;
// Wider than DISTINCT_VALUE_CAP (which is for the named Smart Metadata
// fields only) since this applies to every column — e.g. a "Status" or
// "PaymentMethod" column the platform has no alias for. Above this cap a
// column is presumed high-cardinality (an id, a name, a free-text field)
// and its values aren't worth handing the model.
const COLUMN_DISTINCT_VALUE_CAP = 15;
// A column counts as a given type when this share of its non-blank sampled
// values match.
const COLUMN_TYPE_THRESHOLD = 0.6;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Matches "invoice no" against a header like "Invoice_Number" (and vice
// versa) regardless of punctuation/casing — substring in either direction
// covers both abbreviated headers and abbreviated rule keywords.
function headerMatchesKeyword(normalizedHeader: string, normalizedKeyword: string): boolean {
  if (!normalizedHeader || !normalizedKeyword) return false;
  return normalizedHeader.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedHeader);
}

// Per-sheet Smart Metadata extraction (detected date period, region/branch/
// rep distinct values, per-column type/min/max/distinct). Dataset-TYPE
// classification is a separate, unrelated concern handled entirely by
// ImportTemplateMatcherService's strict sheet-name/column matching
// (ADR-002) — this service used to also run a confidence-scored guess at
// dataset type, but that guess was never consulted by anything (removed
// 2026-07-26).
@Injectable()
export class DatasetClassifierService {
  classifyWorkbook(workbook: XLSX.WorkBook): WorkbookClassification {
    const sheets = workbook.SheetNames.map((sheetName, sheetIndex) => this.classifySheet(workbook, sheetName, sheetIndex));
    return { sheets };
  }

  private classifySheet(workbook: XLSX.WorkBook, sheetName: string, sheetIndex: number): SheetClassification {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) : [];

    // Trim trailing blank header cells (common in exported sheets) but keep
    // interior column indices aligned with the data rows — those indices
    // are relied on below.
    const rawHeaderRow = rows[0] ?? [];
    let lastNonEmpty = -1;
    rawHeaderRow.forEach((h, i) => {
      if (String(h ?? "").trim()) lastNonEmpty = i;
    });
    const headers = rawHeaderRow.slice(0, lastNonEmpty + 1).map((h) => String(h ?? "").trim());
    const dataRows = rows.slice(1);

    return {
      sheetIndex,
      sheetName,
      headers,
      rowCount: Math.max(rows.length - 1, 0),
      detected: this.extractMetadata(headers, dataRows),
      columns: this.buildColumnMetadata(headers, dataRows),
    };
  }

  // Metadata Layer (Sprint 2.2) — per-column type + shape, independent of
  // dataset-type classification and Smart Metadata (extractMetadata below).
  // Lets the model do Stage 3/4 of the reasoning pipeline (metadata
  // inspection, column resolution) from real per-column signal — which
  // headers are numeric/dates and what a low-cardinality column's actual
  // values are — instead of guessing from header names alone.
  private buildColumnMetadata(headers: string[], dataRows: unknown[][]): ColumnMetadata[] {
    const sampleRows = dataRows.slice(0, METADATA_ACCURACY_ROW_CAP);

    return headers.map((header, colIndex) => {
      let nullable = false;
      let nonEmptyCount = 0;
      let numericCount = 0;
      let dateCount = 0;
      let booleanCount = 0;
      let numericMin: number | undefined;
      let numericMax: number | undefined;
      let dateMin: Date | undefined;
      let dateMax: Date | undefined;
      const distinct = new Set<string>();

      for (const row of sampleRows) {
        const value = row[colIndex];
        if (value === undefined || value === null || value === "") {
          nullable = true;
          continue;
        }
        nonEmptyCount++;

        if (typeof value === "number") {
          numericCount++;
          numericMin = numericMin === undefined ? value : Math.min(numericMin, value);
          numericMax = numericMax === undefined ? value : Math.max(numericMax, value);
        } else if (value instanceof Date) {
          dateCount++;
          if (!dateMin || value < dateMin) dateMin = value;
          if (!dateMax || value > dateMax) dateMax = value;
        } else if (typeof value === "boolean") {
          booleanCount++;
        }

        // Capped at +1 over the limit so "size <= cap" below reliably tells
        // apart "genuinely this many distinct values" from "more exist but
        // we stopped counting".
        if (distinct.size <= COLUMN_DISTINCT_VALUE_CAP) distinct.add(String(value).trim());
      }

      let type: ColumnType = "empty";
      if (nonEmptyCount > 0) {
        if (numericCount / nonEmptyCount > COLUMN_TYPE_THRESHOLD) type = "numeric";
        else if (dateCount / nonEmptyCount > COLUMN_TYPE_THRESHOLD) type = "date";
        else if (booleanCount / nonEmptyCount > COLUMN_TYPE_THRESHOLD) type = "boolean";
        else type = "text";
      }

      const meta: ColumnMetadata = { name: header, type, nullable };
      if (type === "numeric") {
        meta.min = numericMin;
        meta.max = numericMax;
      } else if (type === "date") {
        meta.min = dateMin?.toISOString().slice(0, 10);
        meta.max = dateMax?.toISOString().slice(0, 10);
      }
      // Excluded for "date": Date's default string form (e.g. "Mon Jan 05
      // 2026 03:00:00 GMT+0300 ...") isn't a usable filter value, and min/max
      // above already gives the meaningful range signal for this type.
      if (type !== "date" && distinct.size > 0 && distinct.size <= COLUMN_DISTINCT_VALUE_CAP) {
        meta.distinctValues = Array.from(distinct);
      }
      return meta;
    });
  }

  // Smart Metadata — independent of dataset-type classification. Applied to
  // whichever sheet is ultimately selected as the dataset.
  private extractMetadata(headers: string[], dataRows: unknown[][]): DetectedMetadata {
    const normalizedHeaders = headers.map(normalize);
    const findColumn = (aliases: readonly string[]): number =>
      normalizedHeaders.findIndex((h) => aliases.some((a) => headerMatchesKeyword(h, normalize(a))));

    const collectDistinct = (colIndex: number): string[] | undefined => {
      if (colIndex < 0) return undefined;
      const values = new Set<string>();
      for (const row of dataRows.slice(0, METADATA_ACCURACY_ROW_CAP)) {
        const v = row[colIndex];
        if (v !== undefined && v !== null && String(v).trim() !== "") values.add(String(v).trim());
        if (values.size > DISTINCT_VALUE_CAP) return [`${values.size}+ distinct values`];
      }
      return values.size > 0 ? Array.from(values) : undefined;
    };

    const detected: DetectedMetadata = {
      region: collectDistinct(findColumn(METADATA_FIELD_ALIASES.region)),
      branch: collectDistinct(findColumn(METADATA_FIELD_ALIASES.branch)),
      salesRep: collectDistinct(findColumn(METADATA_FIELD_ALIASES.salesRep)),
      route: collectDistinct(findColumn(METADATA_FIELD_ALIASES.route)),
    };

    const dateCol = findColumn(METADATA_FIELD_ALIASES.date);
    if (dateCol >= 0) {
      let min: Date | undefined;
      let max: Date | undefined;
      for (const row of dataRows.slice(0, METADATA_ACCURACY_ROW_CAP)) {
        const v = row[dateCol];
        const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : undefined;
        if (!d || Number.isNaN(d.getTime())) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
      if (min && max) detected.period = { from: min.toISOString().slice(0, 10), to: max.toISOString().slice(0, 10) };
    }

    return detected;
  }
}
