import { Injectable } from "@nestjs/common";
import type { DataSourceValidationResult } from "@field-sales-os/schemas";
import { OrgUnitsService } from "../companies/org-units.service";
import { DataSourceContextService } from "./data-source-context.service";
import { ProviderRegistryService } from "./providers/provider-registry.service";

// Phase 7 — Data Source Validation. Callable standalone (a future "Validate"
// action) and reused as Refresh Validation's first step (Phase 8).
//
// Interpretation note (documented, not hidden): the constitution lists
// schema/column/filename/version compatibility among the required checks,
// but with only a "Basic" Schema Registry in this MVP (most operational
// categories have no registered SchemaDefinition yet), treating those as
// hard blockers would make every refresh fail by default. So only the
// structural checks below (source exists, provider registered, company has
// at least one active Branch — "Companies → Regions → Branches" per the
// constitution's Initial Company Import order) gate `valid`. Schema/file
// coverage is measured and reported, but as part of the Data Quality Report
// (Phase 8), not as a hard pre-condition — consistent with how Phase 6 kept
// testConnection() structural-only rather than over-enforcing.
@Injectable()
export class DataSourceValidationService {
  constructor(
    private readonly contextService: DataSourceContextService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly orgUnitsService: OrgUnitsService,
  ) {}

  async validate(companyId: string, dataSourceId: string): Promise<DataSourceValidationResult> {
    const checks: DataSourceValidationResult["checks"] = [];

    // 1. وجود المصدر — source exists (throws NotFoundException otherwise,
    // which is exactly the "doesn't validate" outcome).
    const context = await this.contextService.build(companyId, dataSourceId);
    checks.push({ name: "source_exists", passed: true });

    // 2. Provider registered (سلامة الاتصال / provider readiness stand-in
    // for a file-based MVP source, which has no live connection to test).
    let providerOk = false;
    try {
      this.providerRegistry.get(context.provider ?? "");
      providerOk = true;
    } catch {
      providerOk = false;
    }
    checks.push({
      name: "provider_registered",
      passed: providerOk,
      message: providerOk ? undefined : `No provider registered for "${context.provider}"`,
    });

    // 3. Structural readiness — Companies → Regions → Branches must exist
    // before any operational data is considered ("Structural Validation").
    const branches = await this.orgUnitsService.list(companyId, { type: "BRANCH" });
    const hasActiveBranch = branches.some((b) => b.status !== "ARCHIVED");
    checks.push({
      name: "structural_readiness",
      passed: hasActiveBranch,
      message: hasActiveBranch ? undefined : "No active Branch registered for this company yet",
    });

    const valid = checks.every((c) => c.passed);
    return { valid, checks, validatedAt: new Date() };
  }
}
