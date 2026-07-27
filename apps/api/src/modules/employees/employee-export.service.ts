import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma";
import { RieFacade } from "../rie/rie-facade.service";
import { normalizeHeader } from "../files/dataset-query.util";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

// Per-Employee Scoped Excel Export (2026-07-27) — built as the concrete
// mitigation for the data-leak risk flagged when the GPT Action pivoted to
// "uploaded file is the only data source" (see PROJECT_LOG.md): if a
// supervisor uploads one shared workbook containing every rep's rows into a
// single rep's ChatGPT conversation, that rep can read a colleague's data —
// no in-chat instruction can reliably prevent it. This service produces a
// workbook containing ONLY the data the TARGET employee is authorized to
// see, computed server-side, before any file ever reaches a chat.
//
// Two independent checks, deliberately not conflated:
//   1. AUTHORIZATION — is the CALLER allowed to pull THIS employee's export?
//      Walks Phase 5's own Employee.managerId org chart (the formal
//      registry this screen already manages), never the uploaded-Excel
//      hierarchy. Runs first, before any data is read.
//   2. DATA SCOPING — what rows does the TARGET employee themselves see?
//      Reuses the exact same row-level filter every other screen in this
//      platform already relies on (CanonicalHierarchyResolverService via
//      RieFacade.getEntityRecords), just computed against the TARGET's
//      identity instead of the caller's.
// A caller can be authorized to pull an export whose data-scoping still
// fails (e.g. the target's email isn't in the uploaded Employees dataset)
// — that's a data-quality error, not an authorization one, and is reported
// with a distinct message rather than silently returning an empty file.

// Roles CanonicalHierarchyResolverService ever restricts (see
// canonical-hierarchy-resolver.service.ts's ROUTE_SCOPED_ROLES) — anyone
// else (COMPANY_ADMIN, SUPER_ADMIN) is unrestricted there, and is treated
// the same way here for the AUTHORIZATION check only. Never used to change
// how the TARGET's data is scoped — see scopedIdentityFor below, which
// always passes a scoped role for the target regardless of the caller's own
// role, so there is never a code path that hands back unfiltered
// operational data for a "scoped" sheet.
const ROUTE_SCOPED_ROLES = new Set(["SALES_REP", "SUPERVISOR", "MANAGER"]);

// Fixed, ordered sheet list — every export produces exactly these sheets,
// in this order, every time, even when a sheet is empty (dataset not
// uploaded, or genuinely zero rows in scope for this employee). Deliberate:
// a GPT (or any other downstream reader) handed this file needs a
// structure it can rely on being identical call to call, not one that
// silently reshapes itself per company. `scoped: false` sheets are
// reference/catalog data with no single owning employee (per explicit
// product decision) and are copied in full, unfiltered.
interface ExportSheetSpec {
  sheetName: string;
  entityName: string;
  scoped: boolean;
  // Canonical column name (per FSOS Import Template spec — see
  // import-templates.data.ts) this entity's rows carry their transaction
  // date under, if any. When set and the caller passes a date range, rows
  // outside [fromDate, toDate] are dropped before the response is built.
  // Entities with no natural transaction date (Employees, Routes,
  // Customers, Targets, and reference sheets) are left undefined and are
  // never date-filtered — a date range narrows "which activity happened
  // when," not "who exists." Invoice Items has no date column of its own
  // (it FKs to InvoiceNo, not a date) — filtering it by date would require
  // joining against Invoices, which this export doesn't do; it is scoped by
  // hierarchy like every other sheet, just not by date range.
  dateField?: string;
}

const EXPORT_SHEETS: readonly ExportSheetSpec[] = [
  { sheetName: "الموظفين", entityName: "Employees", scoped: true },
  { sheetName: "المسارات", entityName: "Routes", scoped: true },
  { sheetName: "العملاء", entityName: "Customers", scoped: true },
  { sheetName: "الفواتير", entityName: "Invoices", scoped: true, dateField: "InvoiceDate" },
  { sheetName: "بنود الفواتير", entityName: "Invoice Items", scoped: true },
  { sheetName: "المرتجعات", entityName: "Returns", scoped: true, dateField: "ReturnDate" },
  { sheetName: "الزيارات", entityName: "Visits", scoped: true, dateField: "VisitDate" },
  { sheetName: "التحصيلات", entityName: "Collections", scoped: true, dateField: "CollectionDate" },
  { sheetName: "الأهداف", entityName: "Targets", scoped: true },
  { sheetName: "التقويم البيعي", entityName: "Sales Calendar", scoped: false },
  { sheetName: "المنتجات", entityName: "Products", scoped: false },
  { sheetName: "قائمة الأسعار", entityName: "Price List", scoped: false },
];

// Inclusive on both ends: fromDate 00:00:00 through toDate 23:59:59. Rows
// whose date field is missing or unparseable are dropped when a range is
// active — a row we can't place in time can't be confirmed to be in range,
// and this export's whole premise is "only what's allowed," so ambiguous
// rows fail closed (excluded), not included.
// "end" bumps the parsed date to 23:59:59.999 so a toDate of e.g. "2026-07-27"
// includes the whole day, not just its midnight instant.
function parseDateBound(value: string | undefined, edge: "start" | "end"): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (edge === "end") parsed.setHours(23, 59, 59, 999);
  else parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function withinDateRange(value: unknown, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  if (value === null || value === undefined || value === "") return false;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return false;
  if (from && parsed < from) return false;
  if (to && parsed > to) return false;
  return true;
}

export interface EmployeeExportSheet {
  sheetName: string;
  entityName: string;
  scoped: boolean;
  available: boolean;
  rowCount: number;
  fields: string[];
  rows: Record<string, unknown>[];
}

export interface EmployeeExportResult {
  employee: { id: string; employeeCode: string; fullName: string };
  generatedAt: string;
  sheets: EmployeeExportSheet[];
}

@Injectable()
export class EmployeeExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rieFacade: RieFacade,
  ) {}

  // Employees the CALLER is authorized to pull an export for — self plus
  // every transitive report, per the same Employee.managerId org chart used
  // by assertCallerAuthorized. Used to build the export picker list (Files
  // screen) so a rep/supervisor/manager never even SEES a colleague or
  // stranger's name there, on top of (never instead of) the server-side
  // 403 that assertCallerAuthorized still enforces on the export call
  // itself. COMPANY_ADMIN/SUPER_ADMIN get every employee, same convention
  // as assertCallerAuthorized's own unrestricted-role short-circuit.
  async listExportableEmployees(companyId: string, requestingUser: AuthenticatedUser) {
    const allEmployees = await this.prisma.employee.findMany({
      where: { companyId },
      select: { id: true, employeeCode: true, fullName: true, jobTitle: true, managerId: true, status: true },
      orderBy: { fullName: "asc" },
    });

    if (!ROUTE_SCOPED_ROLES.has(requestingUser.roleCode)) return allEmployees;

    const callerRecord = await this.prisma.employee.findFirst({ where: { companyId, userId: requestingUser.userId } });
    if (!callerRecord) return []; // not linked to an Employee record — nothing verifiable to show.

    const children = new Map<string, typeof allEmployees>();
    for (const e of allEmployees) {
      if (!e.managerId) continue;
      const list = children.get(e.managerId) ?? [];
      list.push(e);
      children.set(e.managerId, list);
    }

    const byId = new Map(allEmployees.map((e) => [e.id, e]));
    const visible: typeof allEmployees = [];
    const visited = new Set<string>([callerRecord.id]);
    const queue = [callerRecord.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const record = byId.get(current);
      if (record) visible.push(record);
      for (const child of children.get(current) ?? []) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return visible.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async exportForEmployee(
    companyId: string,
    requestingUser: AuthenticatedUser,
    targetEmployeeId: string,
    dateRange?: { fromDate?: string; toDate?: string },
  ): Promise<EmployeeExportResult> {
    const target = await this.prisma.employee.findFirst({ where: { id: targetEmployeeId, companyId } });
    if (!target) throw new NotFoundException("Employee not found");

    // 1. AUTHORIZATION — before any data is read.
    await this.assertCallerAuthorized(companyId, requestingUser, target.id);

    // 2. DATA SCOPING — by the TARGET's own identity, never the caller's.
    const targetEmail = target.contactEmail?.trim();
    if (!targetEmail || !(await this.emailExistsInUploadedEmployees(companyId, targetEmail))) {
      throw new ForbiddenException("Employee email is not mapped to the uploaded Employees dataset");
    }

    // Any ROUTE_SCOPED_ROLES member works identically here — the resolver
    // only uses roleCode to decide WHETHER to restrict at all (see its own
    // comment); which of the three it is never changes the computed
    // subtree. Using "SALES_REP" unconditionally means the actual scoping
    // logic (self-only vs self+reports vs whole subtree) is derived purely
    // from the target's real position in the uploaded Employees/Routes
    // hierarchy, not from any role label we'd have to get right here.
    const scopedIdentity = { roleCode: "SALES_REP", email: targetEmail };

    // 3. DATE RANGE — a narrowing filter on top of the hierarchy scope
    // above, never a substitute for it. Parsed once; invalid strings are
    // treated as "no bound" rather than thrown, since this is a convenience
    // filter, not a validated form field.
    const fromDate = parseDateBound(dateRange?.fromDate, "start");
    const toDate = parseDateBound(dateRange?.toDate, "end");

    const sheets: EmployeeExportSheet[] = [];
    for (const spec of EXPORT_SHEETS) {
      const result = await this.rieFacade.getEntityRecords(spec.entityName, {
        companyId,
        ...(spec.scoped ? { requestingUser: scopedIdentity } : {}),
      });

      let rows = result.records as Record<string, unknown>[];
      if (spec.dateField && (fromDate || toDate)) {
        const actualField = result.fields.find((f) => normalizeHeader(f) === normalizeHeader(spec.dateField!));
        rows = actualField ? rows.filter((r) => withinDateRange(r[actualField], fromDate, toDate)) : [];
      }

      sheets.push({
        sheetName: spec.sheetName,
        entityName: spec.entityName,
        scoped: spec.scoped,
        available: result.available,
        rowCount: rows.length,
        fields: [...result.fields],
        rows,
      });
    }

    return {
      employee: { id: target.id, employeeCode: target.employeeCode, fullName: target.fullName },
      generatedAt: new Date().toISOString(),
      sheets,
    };
  }

  // Walks Phase 5's own Employee.managerId org chart downward from the
  // caller's linked Employee record — self plus every transitive report.
  // Deliberately independent of CanonicalHierarchyResolverService (which
  // answers a different question: what ROUTE data can an identity see) —
  // this answers "may this person pull THIS employee's export at all",
  // using the formal registry this very screen manages, not the uploaded
  // Excel data (which might not even be mapped yet — see the
  // emailExistsInUploadedEmployees check below, which is data-scoping, not
  // authorization, and must never substitute for this check).
  private async assertCallerAuthorized(companyId: string, requestingUser: AuthenticatedUser, targetEmployeeId: string): Promise<void> {
    if (!ROUTE_SCOPED_ROLES.has(requestingUser.roleCode)) return; // COMPANY_ADMIN/SUPER_ADMIN — unrestricted, same convention as everywhere else.

    const caller = await this.prisma.employee.findFirst({ where: { companyId, userId: requestingUser.userId } });
    if (!caller) {
      // Fail closed: a scoped-role caller with no linked Employee record has
      // no verifiable subtree — "can't verify" must never mean "allow".
      throw new ForbiddenException("Your account is not linked to an Employee record, so employee exports cannot be authorized for you.");
    }

    const allEmployees = await this.prisma.employee.findMany({ where: { companyId }, select: { id: true, managerId: true } });
    const children = new Map<string, string[]>();
    for (const e of allEmployees) {
      if (!e.managerId) continue;
      const list = children.get(e.managerId) ?? [];
      list.push(e.id);
      children.set(e.managerId, list);
    }

    const visited = new Set<string>([caller.id]);
    const queue = [caller.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === targetEmployeeId) return; // authorized — self or transitive report.
      for (const child of children.get(current) ?? []) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }

    throw new ForbiddenException("You are not authorized to export this employee's data.");
  }

  // Confirms the target's email actually appears in the company's currently
  // uploaded "Employees" dataset before we let CanonicalHierarchyResolverService
  // near it — without this, an unmapped email would silently fall through to
  // that resolver's own fallback (matching the raw email string directly
  // against Routes' assignment columns), which usually resolves to "no
  // routes matched" but is a coincidental empty result, not a deliberate
  // one. Checking membership explicitly turns that into the clear error the
  // caller actually needs to act on.
  private async emailExistsInUploadedEmployees(companyId: string, email: string): Promise<boolean> {
    const result = await this.rieFacade.getEntityRecords("Employees", { companyId }); // unscoped — checking existence, not returning data.
    if (!result.available || result.records.length === 0) return false;

    const emailField = result.fields.find((f) => normalizeHeader(f) === normalizeHeader("Email"));
    if (!emailField) return false;

    const target = email.trim().toLowerCase();
    return result.records.some((r) => String(r[emailField] ?? "").trim().toLowerCase() === target);
  }
}
