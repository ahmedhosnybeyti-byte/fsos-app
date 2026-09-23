import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { FilesService } from "./files.service";
import { IMPORT_TEMPLATES } from "../import-validation/import-templates.data";

test("current-state business-key SQL covers every approved import template", () => {
  const migration = readFileSync(resolve(process.cwd(), "packages/database/prisma/migrations/20260923020000_rie_canonical_current_state/migration.sql"), "utf8");
  for (const template of IMPORT_TEMPLATES) {
    assert.match(migration, new RegExp(`WHEN '${template.entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`));
    for (const key of template.primaryKey) assert.ok(migration.includes(`->> '${key}'`), `${template.entity}.${key} missing from current-state key SQL`);
  }
});

test("canonical upload history preserves duplicate and blank business keys before READY publication", async () => {
  const createdRows: Array<{ entityKey: string; data: unknown }> = [];
  let activated: Record<string, unknown> | undefined;
  const tx = {
    rieDatasetVersion: {
      create: async () => ({ id: "version-1" }),
      update: async ({ data }: { data: Record<string, unknown> }) => { activated = data; },
    },
    rieEntityRow: {
      createMany: async ({ data }: { data: Array<{ entityKey: string; data: unknown }> }) => { createdRows.push(...data); },
      findMany: async ({ where }: { where: { entityKey: { in: string[] } } }) => createdRows
        .filter((row) => where.entityKey.in.includes(row.entityKey))
        .map((row) => ({ entityKey: row.entityKey, data: row.data })),
    },
  };
  const prisma = { $transaction: async (execute: (client: typeof tx) => Promise<void>) => execute(tx) };
  const service = new FilesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await (service as unknown as {
    materializeEntityShadow(input: {
      companyId: string;
      fileId: string;
      entityName: string;
      keyColumns: readonly string[];
      rows: Record<string, unknown>[];
    }): Promise<void>;
  }).materializeEntityShadow({
    companyId: "company-1",
    fileId: "file-1",
    entityName: "Invoices",
    keyColumns: ["InvoiceNo"],
    rows: [
      { InvoiceNo: "INV-1", Amount: 10 },
      { InvoiceNo: "INV-1", Amount: 20 },
      { InvoiceNo: "", Amount: 30 },
      { InvoiceNo: null, Amount: 40 },
    ],
  });

  assert.deepEqual(createdRows.map((row) => row.entityKey), [
    "INV-1",
    "INV-1␟1",
    "__rie_blank__␟2",
    "__rie_blank__␟3",
  ]);
  assert.equal(activated?.status, "ACTIVE");
  assert.equal(activated?.isActive, true);
  assert.equal(activated?.rowCount, 4);
});
