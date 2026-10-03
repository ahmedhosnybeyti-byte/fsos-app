import { strict as assert } from "node:assert";
import test from "node:test";
import * as XLSX from "xlsx";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { FilesService } from "./files.service";

const COMPANY_ID = "company-1";
const rows = [
  { RouteID: "route-rep", CustomerName: "Scope needle — rep" },
  { RouteID: "route-team", CustomerName: "Scope needle — team" },
  { RouteID: "route-hierarchy", CustomerName: "Scope needle — hierarchy" },
  { RouteID: "route-outside", CustomerName: "Scope needle — outside" },
];

function user(roleCode: AuthenticatedUser["roleCode"]): AuthenticatedUser {
  return { userId: `${roleCode}-user`, companyId: COMPANY_ID, email: `${roleCode}@example.test`, roleCode, permissions: [], mustChangePassword: false, orgUnitId: null };
}

function createService(routeScope: Set<string> | null) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Customers");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new FilesService(
    { file: { findUnique: async () => ({ id: "file-1", companyId: COMPANY_ID, storageKey: "key", sheetIndex: 0, parsedMetadata: { headers: ["RouteID", "CustomerName"] } }) } } as never,
    {} as never,
    {} as never,
    { download: async () => buffer } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { resolveAllowedRouteIds: async () => routeScope } as never,
  );
}

async function searchedRows(roleCode: AuthenticatedUser["roleCode"], routeScope: Set<string> | null) {
  const result = await createService(routeScope).searchRows("file-1", user(roleCode), "scope needle", 10);
  return result.rows.map((row) => row.RouteID);
}

test("Sales Rep cannot retrieve rows outside its own route", async () => {
  assert.deepEqual(await searchedRows("SALES_REP", new Set(["route-rep"])), ["route-rep"]);
});

test("Supervisor cannot retrieve rows outside its team", async () => {
  assert.deepEqual(await searchedRows("SUPERVISOR", new Set(["route-rep", "route-team"])), ["route-rep", "route-team"]);
});

test("Manager cannot retrieve rows outside its hierarchy", async () => {
  assert.deepEqual(await searchedRows("MANAGER", new Set(["route-rep", "route-team", "route-hierarchy"])), ["route-rep", "route-team", "route-hierarchy"]);
});

test("Company Admin can search the whole company", async () => {
  assert.deepEqual(await searchedRows("COMPANY_ADMIN", null), rows.map((row) => row.RouteID));
});
