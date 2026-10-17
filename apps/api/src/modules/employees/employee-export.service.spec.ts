import { strict as assert } from "node:assert";
import test from "node:test";
import * as XLSX from "xlsx";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { EmployeeExportService } from "./employee-export.service";

const admin: AuthenticatedUser = {
  userId: "admin-1",
  companyId: "company-1",
  email: "admin@example.test",
  roleCode: "COMPANY_ADMIN",
  permissions: [],
  mustChangePassword: false,
  orgUnitId: null,
};

test("employee export stays within the RIE budget and produces a valid 15-sheet workbook", async () => {
  const scalableQueries: Record<string, unknown>[] = [];
  const providerReads: string[] = [];
  const prisma = {
    employee: {
      findFirst: async () => ({
        id: "employee-1",
        employeeCode: "EMP-001",
        fullName: "Export Test",
        contactEmail: "rep@example.test",
      }),
    },
  };
  const rieFacade = {
    getEntityRecords: async (entityName: string) => {
      providerReads.push(entityName);
      if (entityName === "Employees") {
        return { available: true, fields: ["EmployeeID", "Email"], records: [{ EmployeeID: "EMP-001", Email: "rep@example.test" }] };
      }
      return { available: true, fields: ["CalendarDate"], records: [{ CalendarDate: "2026-10-17" }] };
    },
    queryCanonicalRecords: async (query: Record<string, unknown>) => {
      scalableQueries.push(query);
      return { records: [{ RouteID: "route-1", InvoiceDate: "2026-10-17" }], page: { limit: 500, offset: 0, hasMore: false } };
    },
  };
  const service = new EmployeeExportService(prisma as never, rieFacade as never);

  const result = await service.exportForEmployee("company-1", admin, "employee-1", {
    fromDate: "2026-10-01",
    toDate: "2026-10-17",
  });

  assert.deepEqual(providerReads, ["Employees", "Sales Calendar"]);
  assert.equal(scalableQueries.length, 14);
  assert.equal(result.sheets.length, 15);
  assert.ok(scalableQueries.every((query) => query.companyId === "company-1" && query.unboundedFinalResult === true));

  const invoices = scalableQueries.find((query) => query.entityName === "Invoices")!;
  assert.deepEqual(invoices.requestingUser, { roleCode: "SALES_REP", email: "rep@example.test" });
  assert.deepEqual(invoices.hierarchyRoute, { field: "RouteID" });
  assert.equal(typeof (invoices.scope as { date: { from: unknown } }).date.from, "number");

  const products = scalableQueries.find((query) => query.entityName === "Products")!;
  assert.equal("requestingUser" in products, false);
  assert.equal("hierarchyRoute" in products, false);

  const workbook = XLSX.utils.book_new();
  for (const sheet of result.sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.rows), sheet.sheetName);
  }
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const reopened = XLSX.read(bytes, { type: "buffer" });
  assert.equal(reopened.SheetNames.length, 15);
  assert.deepEqual(reopened.SheetNames, result.sheets.map((sheet) => sheet.sheetName));
});

