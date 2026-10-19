import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { createWarehouseSchema, updateWarehouseSchema, warehouseListQuerySchema } from "@field-sales-os/schemas";
import { SfaSetupService } from "./sfa-setup.service";

test("checklist probes existing tenant-scoped active registries and never treats unsupported domains as complete", async () => {
  const queries: unknown[] = [];
  let present = false;
  const probe = async (query: unknown) => { queries.push(query); return present ? { id: "record" } : null; };
  const service = new SfaSetupService({ employee: { findFirst: probe }, warehouse: { findFirst: probe } } as never, {} as never);
  const empty = await service.checklist("company-a");
  assert.deepEqual(empty.items.map((item) => [item.key, item.status]), [
    ["products", "NOT_AVAILABLE"], ["customers", "NOT_AVAILABLE"], ["prices", "NOT_AVAILABLE"],
    ["employees", "MISSING"], ["warehouses", "MISSING"], ["openingBalances", "NOT_AVAILABLE"],
  ]);
  assert.deepEqual(queries, [
    { where: { companyId: "company-a", status: "ACTIVE" }, select: { id: true } },
    { where: { companyId: "company-a", isActive: true }, select: { id: true } },
  ]);
  present = true;
  const populated = await service.checklist("company-b");
  assert.equal(populated.items.filter((item) => item.status === "PRESENT").length, 2);
});

test("warehouse list is SQL-filtered, projected and bounded with one lookahead row", async () => {
  let query: any;
  const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
  const service = new SfaSetupService({ warehouse: { findMany: async (input: unknown) => { query = input; return rows; } } } as never, {} as never);
  const result = await service.list("company-a", { page: 2, pageSize: 2, search: "Main" });
  assert.equal(query.where.companyId, "company-a");
  assert.deepEqual(query.where.OR, [{ code: { contains: "Main", mode: "insensitive" } }, { name: { contains: "Main", mode: "insensitive" } }]);
  assert.equal(query.take, 3); assert.equal(query.skip, 2);
  assert.deepEqual(Object.keys(query.select).sort(), ["address", "code", "id", "isActive", "name"]);
  assert.deepEqual(result, { items: rows.slice(0, 2), page: 2, pageSize: 2, hasMore: true });
  await assert.rejects(service.list("company-a", { pageSize: 10000 }));
});

test("writes use authenticated tenant, existing audit service and the same transaction", async () => {
  const writes: any[] = [], audits: any[] = [];
  const row = { id: "warehouse-a", code: "MAIN", name: "Main", address: null, isActive: true };
  const tx = { warehouse: {
    create: async (input: unknown) => { writes.push(input); return row; },
    updateMany: async (input: any) => { writes.push(input); return { count: input.where.companyId === "company-a" ? 1 : 0 }; },
    findFirstOrThrow: async () => row,
  } };
  const service = new SfaSetupService({ $transaction: async (fn: Function) => fn(tx) } as never,
    { record: async (entry: unknown, client: unknown) => { assert.equal(client, tx); audits.push(entry); } } as never);
  await service.create("company-a", { code: " main ", name: " Main " }, "actor");
  assert.deepEqual(writes[0].data, { companyId: "company-a", code: "MAIN", name: "Main" });
  await service.update("company-a", row.id, { isActive: false }, "actor");
  assert.deepEqual(writes[1].where, { companyId: "company-a", id: row.id });
  assert.deepEqual(writes[1].data, { isActive: false });
  assert.deepEqual(audits.map((entry) => [entry.companyId, entry.userId, entry.action]), [
    ["company-a", "actor", "warehouse.created"], ["company-a", "actor", "warehouse.updated"],
  ]);
  await assert.rejects(service.update("company-b", row.id, { name: "Hijack" }, "actor"), NotFoundException);
  assert.equal(audits.length, 2);
  await assert.rejects(service.create("company-a", { code: "X", name: "X", companyId: "company-b" }, "actor"));
});

test("single warehouse reads cannot cross tenants and payload limits are strict", async () => {
  const service = new SfaSetupService({ warehouse: { findFirst: async (input: any) => {
    assert.deepEqual(input.where, { companyId: "company-b", id: "warehouse-a" }); return null;
  } } } as never, {} as never);
  await assert.rejects(service.get("company-b", "warehouse-a"), NotFoundException);
  for (const value of [{ code: "", name: "Main" }, { code: "A", name: " " }, { code: "a b", name: "X" }, { code: "A", name: "X", balance: 1 }]) {
    assert.equal(createWarehouseSchema.safeParse(value).success, false);
  }
  assert.equal(updateWarehouseSchema.safeParse({}).success, false);
  assert.equal(updateWarehouseSchema.safeParse({ companyId: "company-b" }).success, false);
  assert.equal(warehouseListQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(warehouseListQuerySchema.safeParse({ search: "x".repeat(81) }).success, false);
});
