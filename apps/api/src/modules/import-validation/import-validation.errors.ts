import { HttpException, HttpStatus } from "@nestjs/common";
import type { ValidationReport } from "./import-validation.types";

/**
 * Thrown when an uploaded file confidently matches one of the 17 FSOS
 * Import Templates but fails validation against it. Carries the full
 * ValidationReport in the response body — per ADR-001 §2.4, this is the
 * ONLY outcome for a non-conforming file: there is no manual-mapping
 * fallback for the caller to fall back to.
 */
export class ImportValidationRejectedException extends HttpException {
  constructor(public readonly report: ValidationReport) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: `الملف "${report.fileName}" لا يطابق قالب الاستيراد الرسمي لـ ${report.entity} (${report.errorCount} خطأ).`,
        error: "ImportValidationFailed",
        // Named `errors` (not `report`) so the platform's global
        // HttpExceptionFilter — which only passes through a `body.errors`
        // key — forwards the full Validation Report to the caller instead
        // of silently dropping it.
        errors: report,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
