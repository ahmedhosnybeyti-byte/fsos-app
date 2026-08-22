/** One-time backfill for the existing Trial Invoices and Invoice Items sheets. */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../../../packages/database/src";
import * as XLSX from "xlsx";

const ENTITIES = [
  { entityName: "Invoices", keyColumns: ["InvoiceNo"] },
  { entityName: "Invoice Items", keyColumns: ["InvoiceNo", "LineNo"] },
] as const;

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "number") return JSON.stringify(Number(value.toPrecision(15)));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const companyId = process.env.TRIAL_COMPANY_ID;
  const workbookPath = process.env.TRIAL_WORKBOOK_PATH;
  if (!databaseUrl || !companyId || !workbookPath) throw new Error("DATABASE_URL, TRIAL_COMPANY_ID, and TRIAL_WORKBOOK_PATH are required.");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const workbook = XLSX.read(await readFile(workbookPath), { type: "buffer", cellDates: true });
    for (const entity of ENTITIES) {
      const file = await prisma.file.findFirst({
        where: { companyId, datasetType: entity.entityName, isActive: true, status: "READY", datasetTypeConfirmed: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, sheetIndex: true },
      });
      if (!file) throw new Error(`No active ${entity.entityName} file found.`);
      const existing = await prisma.rieDatasetVersion.findUnique({
        where: { sourceFileId_entityName: { sourceFileId: file.id, entityName: entity.entityName } },
        select: { isActive: true },
      });
      if (existing?.isActive) continue;
      if (existing) throw new Error(`Incomplete ${entity.entityName} shadow version exists.`);

      const sheetName = workbook.SheetNames[file.sheetIndex];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      const rows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as Record<string, unknown>[];
      const keys = rows.map((row) => entity.keyColumns.map((column) => String(row[column] ?? "").trim()).join("␟"));
      if (keys.some((key) => !key || key.split("␟").some((part) => !part)) || new Set(keys).size !== keys.length) {
        throw new Error(`Invalid ${entity.entityName} canonical keys.`);
      }

      await prisma.$transaction(async (tx) => {
        const version = await tx.rieDatasetVersion.create({ data: { companyId, sourceFileId: file.id, entityName: entity.entityName } });
        if (rows.length > 0) {
          await tx.rieEntityRow.createMany({
            data: rows.map((data, index) => ({ companyId, datasetVersionId: version.id, entityName: entity.entityName, entityKey: keys[index]!, data: data as never })),
          });
        }
        const shadowRows = await tx.rieEntityRow.findMany({ where: { datasetVersionId: version.id }, select: { entityKey: true, data: true } });
        const excelByKey = new Map(rows.map((row, index) => [keys[index]!, stableJson(row)]));
        if (shadowRows.length !== rows.length || shadowRows.length !== excelByKey.size || shadowRows.some((row) => excelByKey.get(row.entityKey) !== stableJson(row.data))) {
          throw new Error(`${entity.entityName} Excel/PostgreSQL verification failed.`);
        }
        await tx.rieDatasetVersion.update({
          where: { id: version.id },
          data: { status: "ACTIVE", isActive: true, rowCount: rows.length, materializedAt: new Date(), activatedAt: new Date() },
        });
        console.log(`${entity.entityName}: ${rows.length}`);
      }, { timeout: 30_000 });
    }

    const [invoices, items] = await Promise.all([
      prisma.rieEntityRow.findMany({ where: { companyId, entityName: "Invoices", datasetVersion: { isActive: true } }, select: { entityKey: true } }),
      prisma.rieEntityRow.findMany({ where: { companyId, entityName: "Invoice Items", datasetVersion: { isActive: true } }, select: { data: true } }),
    ]);
    const invoiceKeys = new Set(invoices.map((invoice) => invoice.entityKey));
    const orphanItems = items.filter((item) => !invoiceKeys.has(String((item.data as Record<string, unknown>).InvoiceNo ?? "").trim()));
    if (orphanItems.length > 0) throw new Error(`Invoice Items relationship verification failed: ${orphanItems.length} orphan rows.`);
    console.log(`Invoice relationship: PASS (${items.length} items).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
