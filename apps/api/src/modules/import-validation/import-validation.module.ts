import { Module } from "@nestjs/common";
import { ImportTemplateMatcherService } from "./import-template-matcher.service";
import { ImportValidationService } from "./import-validation.service";

// Import Validation module — implements ADR-001 §2.3/§2.4 and
// FSOS Import Templates Specification v1.0. No controller: this is a
// library consumed by FilesService's upload pipeline (and, later, any
// other ingestion path that needs to validate a file against a Canonical
// Import Template) rather than a direct HTTP surface.
@Module({
  providers: [ImportTemplateMatcherService, ImportValidationService],
  exports: [ImportTemplateMatcherService, ImportValidationService],
})
export class ImportValidationModule {}
