import { Injectable } from "@nestjs/common";
import { normalizeHeader } from "../files/dataset-query.util";
import type { ImportTemplate, ValidationIssue, ValidationReport } from "./import-validation.types";
import { IMPORT_TEMPLATES_SPEC_VERSION, WARNING_CODES } from "./import-validation.types";

/**
 * Structure-only Import Validation (ADR-002, 2026-07-19 — supersedes the
 * row/value-level checks this service used to run). A file is
 * accepted/rejected purely on whether its SHAPE matches the official FSOS
 * Import Template:
 *   - HEADER-001: a required column is missing entirely.
 *   - HEADER-002: an unknown column is present (warning only — never
 *     blocks acceptance).
 * Sheet identity (official sheet name / position) is decided earlier, by
 * FilesService.resolveSheetsAndTemplates, before this service ever runs.
 *
 * This service deliberately never inspects a row's cell VALUES — no
 * empty-required-field, type, format, enum, range, duplicate-key,
 * foreign-key, conditional, or cross-field checks. Data-value correctness
 * is the uploading company's responsibility, not FSOS's; see
 * docs/adr/ADR-002-structure-only-import-validation.md.
 */
@Injectable()
export class ImportValidationService {
  validate(params: {
    template: ImportTemplate;
    fileName: string;
    headers: readonly string[];
    rows: readonly Record<string, unknown>[];
  }): ValidationReport {
    const { template, fileName, headers, rows } = params;
    const issues: ValidationIssue[] = [];

    const headerLookup = new Set(headers.map(normalizeHeader));
    const knownFieldNames = new Set(template.fields.map((f) => normalizeHeader(f.name)));

    // ---- HEADER-001 (required column missing) ----
    for (const field of template.fields) {
      if (field.required && !headerLookup.has(normalizeHeader(field.name))) {
        issues.push({
          code: "HEADER-001",
          level: "FILE",
          field: field.name,
          message: `العمود "${field.name}" غير موجود في الملف؛ يجب أن يطابق الملف قالب الاستيراد الرسمي لـ ${template.entity} حرفيًا.`,
        });
      }
    }

    // ---- HEADER-002 (unknown column present) — warning only ----
    for (const header of headers) {
      if (!knownFieldNames.has(normalizeHeader(header))) {
        issues.push({
          code: "HEADER-002",
          level: "FILE",
          field: header,
          message: `تم العثور على عمود غير معروف "${header}" في الملف؛ الأعمدة المعروفة لقالب ${template.entity} الرسمي فقط سيتم استخدامها.`,
        });
      }
    }

    const errorCount = issues.filter((i) => !WARNING_CODES.includes(i.code)).length;
    const warningCount = issues.length - errorCount;

    return {
      templateId: template.id,
      entity: template.entity,
      fileName,
      valid: errorCount === 0,
      totalRows: rows.length,
      errorCount,
      warningCount,
      issues,
      validatedAt: new Date().toISOString(),
      specVersion: IMPORT_TEMPLATES_SPEC_VERSION,
    };
  }
}
