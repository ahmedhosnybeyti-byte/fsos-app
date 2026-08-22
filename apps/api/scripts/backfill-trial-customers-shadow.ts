/**
 * One-time Phase 1 backfill for the existing shared-trial Customers workbook.
 * It is intentionally an explicit operator command: it neither changes the
 * upload flow nor introduces a PostgreSQL read path.
 */
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../../../packages/database/src";
import * as XLSX from "xlsx";

const CUSTOMERS_ENTITY = "Customers";

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
  const trialCompanyId = process.env.TRIAL_COMPANY_ID;
  const workbookPath = process.env.CUSTOMERS_WORKBOOK_PATH;
  if (!databaseUrl || !trialCompanyId || !workbookPath) {
    throw new Error("DATABASE_URL, TRIAL_COMPANY_ID, and CUSTOMERS_WORKBOOK_PATH are required.");
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const files = await prisma.file.findMany({
      where: {
        companyId: trialCompanyId,
        datasetType: CUSTOMERS_ENTITY,
        isActive: true,
        status: "READY",
        datasetTypeConfirmed: true,
      },
      select: { id: true, companyId: true, storageKey: true, sheetIndex: true },
    });

    for (const file of files) {
      const existing = await prisma.rieDatasetVersion.findUnique({
        where: { sourceFileId_entityName: { sourceFileId: file.id, entityName: CUSTOMERS_ENTITY } },
        select: { id: true, isActive: true },
      });
      if (existing?.isActive) continue;
      if (existing) throw new Error(`Customers shadow version ${existing.id} is incomplete; refusing to overwrite it.`);

      const workbook = XLSX.read(await readFile(workbookPath), { type: "buffer", cellDates: true, sheets: [file.sheetIndex] });
      const sheetName = workbook.SheetNames[file.sheetIndex];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      const rows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as Record<string, unknown>[];
      const customerCodes = rows.map((row) => String(row.CustomerCode ?? "").trim());
      if (customerCodes.some((key) => !key) || new Set(customerCodes).size !== customerCodes.length) {
        throw new Error(`Invalid CustomerCode values in source file ${file.id}.`);
      }

      await prisma.$transaction(async (tx) => {
        const version = await tx.rieDatasetVersion.create({
          data: { companyId: file.companyId, sourceFileId: file.id, entityName: CUSTOMERS_ENTITY },
        });
        if (rows.length > 0) {
          await tx.rieEntityRow.createMany({
            data: rows.map((data, index) => ({
              companyId: file.companyId,
              datasetVersionId: version.id,
              entityName: CUSTOMERS_ENTITY,
              entityKey: customerCodes[index]!,
              data: data as never,
            })),
          });
        }

        const shadowRows = await tx.rieEntityRow.findMany({
          where: { datasetVersionId: version.id },
          select: { entityKey: true, data: true },
        });
        const excelByKey = new Map(rows.map((row, index) => [customerCodes[index]!, stableJson(row)]));
        const matches = shadowRows.length === rows.length
          && shadowRows.length === excelByKey.size
          && shadowRows.every((row) => excelByKey.get(row.entityKey) === stableJson(row.data));
        if (!matches) {
          const mismatch = shadowRows.find((row) => excelByKey.get(row.entityKey) !== stableJson(row.data));
          const excelRow = rows.find((row) => String(row.CustomerCode ?? "").trim() === mismatch?.entityKey) ?? {};
          const shadowRow = (mismatch?.data ?? {}) as Record<string, unknown>;
          const differentFields = [...new Set([...Object.keys(excelRow), ...Object.keys(shadowRow)])]
            .filter((key) => stableJson(excelRow[key]) !== stableJson(shadowRow[key]));
          const differences = differentFields.map((key) => `${key}:excel=${stableJson(excelRow[key])}:shadow=${stableJson(shadowRow[key])}`).join("; ");
          throw new Error(`Excel/PostgreSQL verification failed for ${file.id}: excelRows=${rows.length}, shadowRows=${shadowRows.length}, excelKeys=${excelByKey.size}, firstMismatchedKey=${mismatch?.entityKey ?? "none"}, ${differences}.`);
        }

        await tx.rieDatasetVersion.update({
          where: { id: version.id },
          data: { status: "ACTIVE", isActive: true, rowCount: rows.length, materializedAt: new Date(), activatedAt: new Date() },
        });
      }, { timeout: 30_000 });
      console.log(`Materialized ${file.id}: ${rows.length} Customers rows.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
