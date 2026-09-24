import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type VisitEfficiencyRieQueryInput,
  type VisitEfficiencyResult,
  type VisitEfficiencyScopeField,
  type VisitEfficiencyValuesResult,
} from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";

// Migration #6 (ADR-001 / RIE Migration Plan, 2026-07-17) — RIE-backed, no
// file/column mapping. FilesService is no longer a dependency of this
// service.
//
// Rep identity: the Canonical Visits entity has no rep/employee field of
// its own (see Import Templates Spec §6.10 / canonical-entities.data.ts) —
// rep is derived via a two-hop join, Visits.RouteID -> Routes.SalesRepID ->
// Employees.EmployeeName. This mirrors REL-DER-002 ("Visit_ConductedBy") in
// the Relationship Registry, whose full definition is a time-aware lookup
// through Route Assignment history as-of VisitDate. That intermediate
// entity ("Route Assignments") has no data-source mapping anywhere on the
// platform yet (ENTITY_DATASET_TYPE_MAP marks it UNMAPPED — no uploaded
// dataset and no Prisma table), so this service resolves the simpler,
// available half of that relationship: Routes' CURRENT SalesRepID (same
// "current state" resolution already used by the Route hierarchy filter,
// Task #138) rather than a historical-as-of-date lookup. This is disclosed
// in the completion report, not silently approximated.
//
// Coordinates: prefer Visits.Latitude/Longitude directly when present and
// sane; otherwise fall back to the joined Customer's Latitude/Longitude via
// CustomerCode. Automatic, per-row — replaces the old manual
// direct-vs-join toggle (itself a Manual Mapping concern) with RIE always
// trying the best available source.
@Injectable()
export class VisitEfficiencyService {
  constructor(
    private readonly rieFacade: RieFacade,
    private readonly scalableQuery: RieScalableQueryService,
  ) {}

  private async requireSource(
    context: ReturnType<VisitEfficiencyService["rieContext"]>,
    entityName: string,
    arabicLabel: string,
  ): Promise<void> {
    if (!(await this.rieFacade.hasCanonicalEntitySources(context, [entityName]))) {
      throw new NotFoundException(`بيانات "${arabicLabel}" غير متاحة — تأكد من رفع ملف يطابق قالب الاستيراد الرسمي لهذا الـ Dataset.`);
    }
  }

  // Every RIE read in this service must pass requestingUser — see the
  // identical comment in geo-intelligence.service.ts. Centralized here so
  // every call site in this file gets Hierarchy Row-Level Filtering the
  // same way instead of relying on each one to remember.
  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  async query(user: AuthenticatedUser, input: VisitEfficiencyRieQueryInput): Promise<VisitEfficiencyResult> {
    const ctx = this.rieContext(user);
    // Keep the legacy availability/error order without materializing a row.
    await this.requireSource(ctx, "Visits", "الزيارات");
    await this.requireSource(ctx, "Routes", "المسارات");
    await this.requireSource(ctx, "Customers", "العملاء");
    const fromTime = input.dateFrom ? Date.parse(input.dateFrom) : null;
    const toTime = input.dateTo ? Date.parse(input.dateTo) : null;
    const result = await this.scalableQuery.queryVisitEfficiency({
      ...ctx,
      scopeField: input.scopeField,
      scopeValues: input.scopeValues,
      requireValidDate: Boolean(input.dateFrom || input.dateTo),
      ...(fromTime !== null && Number.isFinite(fromTime) ? { fromTime } : {}),
      ...(toTime !== null && Number.isFinite(toTime) ? { toTime } : {}),
    });
    if (input.scopeField && input.scopeValues?.length && result.matchedScopeRows === 0) {
      throw new BadRequestException(`لا توجد بيانات مطابقة لـ ${input.scopeField} ضمن [${input.scopeValues.join(", ")}]`);
    }
    const { matchedScopeRows: _matchedScopeRows, ...response } = result;
    return response;
  }

  // RIE-backed dedicated dropdown endpoint for the scope field — same
  // pattern as Migrations #3/#4/#5's scope-values endpoints. Sourced from
  // Customers (scope fields are Customer attributes), not Visits.
  async scopeValues(user: AuthenticatedUser, scopeField: VisitEfficiencyScopeField): Promise<VisitEfficiencyValuesResult> {
    const ctx = this.rieContext(user);
    await this.requireSource(ctx, "Customers", "العملاء");
    const result = await this.rieFacade.queryCanonicalRecords({
      ...ctx,
      entityName: "Customers",
      projection: [{ field: scopeField, as: "value" }],
      groupBy: [{ field: scopeField }],
      unboundedFinalResult: true,
    });
    const values = new Set(result.records.map((row) => String(row.value ?? "").trim()).filter(Boolean));
    return { values: Array.from(values).sort((a, b) => a.localeCompare(b)) };
  }
}
