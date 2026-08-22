/**
 * One-time Collections materialization from the active Production Trial
 * workbook.  It downloads the file through the configured object store; it
 * never accepts a local workbook path, so DEMO/reference files cannot enter
 * this migration.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "../../../packages/database/src";
import * as XLSX from "xlsx";

const ENTITY = "Collections";
const KEY = "CollectionNo";
const BASIC_FIELDS = ["CollectionNo", "CollectionDate", "CustomerCode", "InvoiceNo", "Amount", "PaymentMethod", "RouteID", "Status"] as const;

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "number") return JSON.stringify(Number(value.toPrecision(15)));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function streamToBuffer(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const configuredTrialSlugs = [process.env.TRIAL_EGYPT_COMPANY_SLUG, process.env.TRIAL_SAUDI_ARABIA_COMPANY_SLUG].filter((slug): slug is string => Boolean(slug));
  const trialSlugs = process.env.TRIAL_COMPANY_SLUG ? [process.env.TRIAL_COMPANY_SLUG] : configuredTrialSlugs;
  if (!databaseUrl || !endpoint || !bucket || !accessKeyId || !secretAccessKey || !trialSlugs.length) throw new Error("Production DATABASE_URL, storage settings, and Trial company slug are required.");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = new S3Client({ endpoint, region: process.env.STORAGE_REGION ?? "auto", forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true", credentials: { accessKeyId, secretAccessKey } });
  try {
    const files = await prisma.file.findMany({
      where: { company: { slug: { in: trialSlugs } }, datasetType: ENTITY, isActive: true, status: "READY", datasetTypeConfirmed: true },
      select: { id: true, companyId: true, storageKey: true, sheetIndex: true, company: { select: { slug: true } } },
    });
    if (files.length !== 1) throw new Error(`Expected exactly one active Trial Collections dataset; found ${files.length}.`);
    const file = files[0]!;
    const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: file.storageKey }));
    if (!object.Body) throw new Error("Active Production Collections workbook has no object body.");
    const workbook = XLSX.read(await streamToBuffer(object.Body as AsyncIterable<Uint8Array>), { type: "buffer", cellDates: true, sheets: [file.sheetIndex] });
    const sheetName = workbook.SheetNames[file.sheetIndex];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    const excelRows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as Record<string, unknown>[];
    const keys = excelRows.map((row) => String(row[KEY] ?? "").trim());
    if (process.env.COLLECTIONS_DRY_RUN === "true") {
      console.log(`Trial source: ${file.company.slug}; Excel=${excelRows.length}; key=${KEY}; uniqueKeys=${new Set(keys).size}.`);
      return;
    }
    if (excelRows.length !== 49_425) throw new Error(`Expected 49,425 Collections rows; found ${excelRows.length}.`);
    if (keys.some((key) => !key) || new Set(keys).size !== keys.length) throw new Error("CollectionNo is missing or non-unique in the active Production Trial source.");

    const existing = await prisma.rieDatasetVersion.findUnique({ where: { sourceFileId_entityName: { sourceFileId: file.id, entityName: ENTITY } }, select: { id: true, isActive: true } });
    if (existing?.isActive && process.env.COLLECTIONS_VERIFY_ONLY === "true") {
      const postgresRows = await prisma.rieEntityRow.findMany({ where: { datasetVersionId: existing.id }, select: { entityKey: true, data: true } });
      const excelByKey = new Map(excelRows.map((row, index) => [keys[index]!, row]));
      const sameData = postgresRows.length === excelRows.length && postgresRows.every((row) => stableJson(excelByKey.get(row.entityKey)) === stableJson(row.data));
      const basicMatches = postgresRows.every((row) => {
        const excel = excelByKey.get(row.entityKey)!;
        return BASIC_FIELDS.every((field) => stableJson(excel[field]) === stableJson((row.data as Record<string, unknown>)[field]));
      });
      const filtersPass = ["RouteID", "Status"].every((field) => {
        const value = String(excelRows.find((row) => row[field] !== null && row[field] !== undefined)?.[field] ?? "");
        const excelKeys = excelRows.filter((row) => String(row[field] ?? "") === value).map((row) => String(row[KEY])).sort();
        const postgresKeys = postgresRows.filter((row) => String((row.data as Record<string, unknown>)[field] ?? "") === value).map((row) => row.entityKey).sort();
        return stableJson(excelKeys) === stableJson(postgresKeys);
      });
      if (!sameData || !basicMatches || !filtersPass) throw new Error(`Shadow verification failed: data=${sameData}; basic=${basicMatches}; filters=${filtersPass}.`);
      console.log(`Shadow Read: PASS; Excel=${excelRows.length}; PostgreSQL=${postgresRows.length}; key=${KEY}; basic-data=PASS; filters=PASS.`);
      return;
    }
    if (existing?.isActive) throw new Error(`Active Collections materialization already exists (${existing.id}); refusing to overwrite it.`);
    if (existing) throw new Error(`Incomplete Collections materialization exists (${existing.id}); refusing to overwrite it.`);

    await prisma.$transaction(async (tx) => {
      const version = await tx.rieDatasetVersion.create({ data: { companyId: file.companyId, sourceFileId: file.id, entityName: ENTITY } });
      for (let offset = 0; offset < excelRows.length; offset += 10_000) {
        await tx.rieEntityRow.createMany({ data: excelRows.slice(offset, offset + 10_000).map((data, index) => ({ companyId: file.companyId, datasetVersionId: version.id, entityName: ENTITY, entityKey: keys[offset + index]!, data: data as never })) });
      }
      const postgresRows = await tx.rieEntityRow.findMany({ where: { datasetVersionId: version.id }, select: { entityKey: true, data: true } });
      const excelByKey = new Map(excelRows.map((row, index) => [keys[index]!, row]));
      const basicMatches = postgresRows.every((row) => {
        const excel = excelByKey.get(row.entityKey)!;
        return BASIC_FIELDS.every((field) => stableJson(excel[field]) === stableJson((row.data as Record<string, unknown>)[field]));
      });
      const pass = postgresRows.length === excelRows.length && postgresRows.length === excelByKey.size && postgresRows.every((row) => stableJson(excelByKey.get(row.entityKey)) === stableJson(row.data)) && basicMatches;
      if (!pass) throw new Error(`Collections verification failed: excelRows=${excelRows.length}, postgresRows=${postgresRows.length}, uniqueKeys=${excelByKey.size}, basicFields=${basicMatches}.`);
      await tx.rieDatasetVersion.update({ where: { id: version.id }, data: { status: "ACTIVE", isActive: true, rowCount: excelRows.length, materializedAt: new Date(), activatedAt: new Date() } });
    }, { timeout: 600_000 });
    console.log(`Materialization: PASS; Excel=${excelRows.length}; PostgreSQL=${excelRows.length}; key=${KEY}; basic-data=PASS; trial=${file.company.slug}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
