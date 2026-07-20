// FSOS Import Validation — type definitions.
//
// This module implements the Import Validation layer mandated by
// ADR-001 ("إلغاء واجهات اختيار أعمدة الربط اليدوي") and, as of ADR-002
// ("Structure-Only Import Validation", 2026-07-19), scoped to STRUCTURE
// ONLY — the file/sheet's shape (official sheet identity + which columns
// exist), never the values inside those columns. Data-value correctness
// (a Status of "1 Collected", a negative amount, a duplicate invoice
// number, a dangling foreign key, ...) is the uploading company's
// responsibility, not something FSOS rejects a file for. See
// docs/adr/ADR-002-structure-only-import-validation.md for the full
// rationale. Do not reintroduce a value-level rule code here without a
// new ADR superseding ADR-002.

/** The 2 structural rule codes this layer enforces, post-ADR-002. */
export type ValidationRuleCode =
  | "HEADER-001" // required column missing from the file entirely
  | "HEADER-002"; // unknown column present in the file

export type ValidationLevel = "FILE" | "ROW" | "CROSS_DATASET";

export type FsosDataType = "String" | "Integer" | "Decimal" | "Date" | "Time" | "Enum";

/**
 * A single field's full contract, as documented per-dataset in §6 of the
 * spec. Post-ADR-002: `name`/`required` are the only properties
 * ImportValidationService still enforces (they decide HEADER-001).
 * `type`/`allowedValues`/`min`/`max`/`fk`/`conditionalRequired` describe
 * the official template's expected data shape and are RETAINED as
 * reference/documentation (e.g. for a future "download official
 * template" or column-hint feature) — they are no longer read by the
 * accept/reject decision.
 */
export interface ImportTemplateField {
  /** Exact header name, copied verbatim from the Canonical Database. */
  name: string;
  required: boolean;
  type: FsosDataType;
  /** Only for type: "Enum". Reference only — see interface doc. */
  allowedValues?: readonly string[];
  /** Only for type: "Decimal" | "Integer". Reference only — see interface doc. */
  min?: number;
  minExclusive?: boolean;
  max?: number;
  maxExclusive?: boolean;
  /** Foreign key target. Reference only — see interface doc. */
  fk?: { entity: string; field: string };
  /**
   * Conditional-required predicate. Reference only — see interface doc.
   * Given the full row (raw, un-coerced string/number map) return true if
   * this field is required for that row (e.g. Collections.Bank when
   * PaymentMethod is Cheque/BankTransfer).
   */
  conditionalRequired?: (row: Record<string, unknown>) => boolean;
  /** Human-readable condition. Reference only — see interface doc. */
  conditionLabel?: string;
  /** Free-text implementation note, carried from the approved spec document. */
  note?: string;
}

/** A cross-field arithmetic consistency rule. Retained as reference/documentation only (ADR-002) — no longer enforced. */
export interface ConsistencyRule {
  fields: readonly string[];
  ruleLabel: string;
  /** Returns true if the row is consistent. */
  check: (row: Record<string, number | null>) => boolean;
}

export interface ImportTemplate {
  id: string;
  /** Canonical Entity name (matches Canonical Database sheet name). */
  entity: string;
  /** Field name(s) forming the primary key — composite keys list >1. */
  primaryKey: readonly string[];
  importOrder: number;
  dependsOn: readonly string[];
  fields: readonly ImportTemplateField[];
  consistencyRules?: readonly ConsistencyRule[];
}

export interface ValidationIssue {
  code: ValidationRuleCode;
  level: ValidationLevel;
  field?: string;
  /** 1-based data row number (header row is row 0, first data row is row 1). */
  row?: number;
  value?: unknown;
  message: string;
}

export interface ValidationReport {
  templateId: string;
  entity: string;
  fileName: string;
  /** True only when there are zero ERROR-level issues (HEADER-001 counts as error; unmatched headers are warnings). */
  valid: boolean;
  totalRows: number;
  errorCount: number;
  warningCount: number;
  issues: readonly ValidationIssue[];
  /** ISO timestamp, for audit trail purposes. */
  validatedAt: string;
  /** Version of the Import Templates spec this report was validated against. */
  specVersion: string;
}

/** Issues that are informational only (do not fail the file). */
export const WARNING_CODES: readonly ValidationRuleCode[] = ["HEADER-002"];

export const IMPORT_TEMPLATES_SPEC_VERSION = "1.0";
