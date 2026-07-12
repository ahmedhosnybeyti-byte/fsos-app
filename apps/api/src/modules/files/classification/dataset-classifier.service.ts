import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { CLASSIFICATION_RULES, METADATA_FIELD_ALIASES } from "./dataset-classification-rules";
import type { CandidateScore, ColumnMetadata, ColumnType, DetectedMetadata, SheetClassification, WorkbookClassification } from "./types";

// 2+ sheets each confidently (>=70) pointing at DIFFERENT dataset types
// means this workbook holds more than one business dataset — never
// silently pick one and discard the rest.
const MIXED_CONFIDENCE_THRESHOLD = 70;
const METADATA_SCAN_ROW_CAP = 2000;
const DISTINCT_VALUE_CAP = 8;
// Wider than DISTINCT_VALUE_CAP (which is for the named Smart Metadata
// fields only) since this applies to every column — e.g. a "Status" or
// "PaymentMethod" column the platform has no alias for. Above this cap a
// column is presumed high-cardinality (an id, a name, a free-text field)
// and its values aren't worth handing the model.
const COLUMN_DISTINCT_VALUE_CAP = 15;
// A column counts as a given type when this share of its non-blank sampled
// values match — mirrors the >0.6 threshold analyzeColumnShapes() already
// used for classification scoring, so the two signals stay consistent.
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

// Rule-based classifier: scores every candidate dataset type against a
// sheet's headers (primary signal), sheet name (minor bonus), and coarse
// column data-shape (minor bonus). No LLM call — fully deterministic,
// requires no external API key, and the entire "vocabulary" it knows lives
// in dataset-classification-rules.ts as data, not branching logic. A future
// model-based classifier can implement the same shape behind this service
// without touching FilesModule.
@Injectable()
export class DatasetClassifierService {
  classifyWorkbook(workbook: XLSX.WorkBook): WorkbookClassification {
    const sheets = workbook.SheetNames.map((sheetName, sheetIndex) => this.classifySheet(workbook, sheetName, sheetIndex));

    let primarySheetIndex = 0;
    let bestConfidence = -1;
    sheets.forEach((sheet, i) => {
      const top = sheet.candidates[0]?.confidence ?? 0;
      if (top > bestConfidence) {
        bestConfidence = top;
        primarySheetIndex = i;
      }
    });

    return { sheets, primarySheetIndex, isMixed: this.detectMixed(sheets) };
  }

  private detectMixed(sheets: SheetClassification[]): boolean {
    if (sheets.length < 2) return false;
    const strongTypes = new Set<string>();
    for (const sheet of sheets) {
      const top = sheet.candidates[0];
      if (top && top.confidence >= MIXED_CONFIDENCE_THRESHOLD) strongTypes.add(top.datasetType);
    }
    return strongTypes.size >= 2;
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
      candidates: this.scoreCandidates(headers, sheetName, dataRows.slice(0, METADATA_SCAN_ROW_CAP)),
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
    const sampleRows = dataRows.slice(0, METADATA_SCAN_ROW_CAP);

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

  private scoreCandidates(headers: string[], sheetName: string, sampleRows: unknown[][]): CandidateScore[] {
    const normalizedHeaders = headers.map(normalize);
    const normalizedSheetName = normalize(sheetName);
    const shapes = this.analyzeColumnShapes(headers, sampleRows);

    const scored = CLASSIFICATION_RULES.map((rule) => {
      let raw = 0;
      let max = 0;
      for (const group of rule.headerGroups) {
        max += group.weight;
        const matched = group.keywords.some((kw) => {
          const nk = normalize(kw);
          return normalizedHeaders.some((nh) => headerMatchesKeyword(nh, nk));
        });
        if (matched) raw += group.weight;
      }

      let score = max > 0 ? raw / max : 0;
      if (rule.sheetNameKeywords.some((kw) => normalizedSheetName.includes(normalize(kw)))) {
        score = Math.min(1, score + 0.15);
      }
      if (rule.expectsNumericColumn && shapes.hasNumericColumn) score = Math.min(1, score + 0.06);
      if (rule.expectsDateColumn && shapes.hasDateColumn) score = Math.min(1, score + 0.06);

      return { datasetType: rule.datasetType, confidence: Math.round(score * 100) };
    });

    return scored.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  // Coarse structural signal: does an "amount"-ish header actually hold
  // mostly numbers, does any column hold mostly real dates. Deliberately
  // shallow — a full column-type inference pipeline is more than this
  // signal needs to be useful as a tiebreaker on top of header matching.
  private analyzeColumnShapes(headers: string[], sampleRows: unknown[][]): { hasNumericColumn: boolean; hasDateColumn: boolean } {
    let hasNumericColumn = false;
    let hasDateColumn = false;

    for (let col = 0; col < headers.length; col++) {
      const header = normalize(headers[col] ?? "");
      const looksAmountish = /(amount|total|price|value|paid|cost|balance)/.test(header);
      const values = sampleRows.map((r) => r[col]).filter((v) => v !== undefined && v !== null && v !== "");
      if (values.length === 0) continue;

      if (looksAmountish) {
        const numericCount = values.filter((v) => typeof v === "number").length;
        if (numericCount / values.length > 0.6) hasNumericColumn = true;
      }

      const dateCount = values.filter((v) => v instanceof Date).length;
      if (dateCount / values.length > 0.6) hasDateColumn = true;
    }

    return { hasNumericColumn, hasDateColumn };
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
      for (const row of dataRows.slice(0, METADATA_SCAN_ROW_CAP)) {
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
      for (const row of dataRows.slice(0, METADATA_SCAN_ROW_CAP)) {
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
