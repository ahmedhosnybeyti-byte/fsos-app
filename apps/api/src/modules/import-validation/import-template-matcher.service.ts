import { Injectable } from "@nestjs/common";
import { normalizeHeader } from "../files/dataset-query.util";
import { IMPORT_TEMPLATES } from "./import-templates.data";
import type { ImportTemplate } from "./import-validation.types";

export interface TemplateMatchResult {
  template: ImportTemplate;
  /** Fraction (0..1) of the template's required headers found in the file. */
  score: number;
  missingRequiredHeaders: readonly string[];
  unknownHeaders: readonly string[];
}

/**
 * Matches an uploaded file's column headers against the 17 approved FSOS
 * Import Templates (FSOS_Import_Templates_v1.0.docx). This is a pure
 * header-shape match — it never inspects row values — so it can run before
 * any row-level validation.
 */
@Injectable()
export class ImportTemplateMatcherService {
  // Official-sheet-name match — the strongest signal a file can offer,
  // since ImportTemplate.entity IS the official Canonical Database sheet
  // name (see import-validation.types.ts). Format-tolerant (case/spacing)
  // via the same normalizeHeader used for column matching everywhere else,
  // but otherwise exact: no partial/fuzzy matching, no scoring. A sheet
  // either is one of the 17 official entities or it isn't — this is what
  // lets FilesService pick WHICH sheet to validate in a multi-sheet
  // workbook without guessing from column overlap.
  matchBySheetName(sheetName: string): ImportTemplate | null {
    const normalized = normalizeHeader(sheetName);
    return IMPORT_TEMPLATES.find((t) => normalizeHeader(t.entity) === normalized) ?? null;
  }

  // Column-based fallback for single-sheet files whose sheet isn't named
  // after an official entity — always returns the closest-scoring template,
  // however poor the score, never null. Used by FilesService's strict
  // upload gate (ADR-001 §2.4): every upload is assumed to be an attempt at
  // one of the canonical templates, so even a weak match still gives the
  // caller a concrete "closest template" to build a rejection report
  // against (missing/unknown headers) instead of silently failing with no
  // explanation.
  bestMatch(headers: readonly string[]): TemplateMatchResult {
    let best: TemplateMatchResult | null = null;
    for (const template of IMPORT_TEMPLATES) {
      const candidate = this.matchAgainst(template, headers);
      if (!best || candidate.score > best.score) best = candidate;
    }

    // IMPORT_TEMPLATES is a non-empty constant — best is always assigned
    // after at least one iteration.
    return best!;
  }

  // Scores headers against ONE already-chosen template — used once
  // FilesService has already decided which template a sheet must be (via
  // official sheet name, or, for single-sheet files, this same column
  // score). Kept separate from bestMatch's search-across-all-templates so
  // that decision is never re-litigated by column overlap with some other
  // template.
  matchAgainst(template: ImportTemplate, headers: readonly string[]): TemplateMatchResult {
    const normalizedFileHeaders = new Set(headers.map(normalizeHeader));
    const requiredFields = template.fields.filter((f) => f.required);
    const missingRequiredHeaders = requiredFields.filter((f) => !normalizedFileHeaders.has(normalizeHeader(f.name))).map((f) => f.name);
    const score = requiredFields.length === 0 ? 0 : (requiredFields.length - missingRequiredHeaders.length) / requiredFields.length;
    const knownNormalized = new Set(template.fields.map((f) => normalizeHeader(f.name)));
    const unknownHeaders = headers.filter((h) => !knownNormalized.has(normalizeHeader(h)));
    return { template, score, missingRequiredHeaders, unknownHeaders };
  }

  getTemplateById(id: string): ImportTemplate | undefined {
    return IMPORT_TEMPLATES.find((t) => t.id === id);
  }

  listTemplates(): readonly ImportTemplate[] {
    return IMPORT_TEMPLATES;
  }
}
