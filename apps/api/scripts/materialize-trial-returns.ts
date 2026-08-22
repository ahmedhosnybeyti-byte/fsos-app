/** One-time Returns/Return Items materialization from acme-demo Production. */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "../../../packages/database/src";
import * as XLSX from "xlsx";

const ENTITIES = [
  { name: "Returns", keys: ["ReturnNo"], expected: 201, basic: ["ReturnNo", "ReturnDate", "CustomerCode", "RouteID", "InvoiceNo", "TotalAmount", "Status"] },
  { name: "Return Items", keys: ["ReturnNo", "LineNo"], expected: 422, basic: ["ReturnNo", "LineNo", "ProductCode", "Quantity", "ReturnReason", "Amount"] },
] as const;
type Entity = typeof ENTITIES[number];
type Row = Record<string, unknown>;

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "number") return JSON.stringify(Number(value.toPrecision(15)));
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Row)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
async function buffer(body: AsyncIterable<Uint8Array>) { const chunks: Uint8Array[] = []; for await (const chunk of body) chunks.push(chunk); return Buffer.concat(chunks); }
function keyOf(row: Row, entity: Entity) { return entity.keys.map((key) => String(row[key] ?? "").trim()).join("␟"); }

async function main() {
  const { DATABASE_URL: databaseUrl, STORAGE_ENDPOINT: endpoint, STORAGE_BUCKET: bucket, STORAGE_ACCESS_KEY_ID: accessKeyId, STORAGE_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
  if (!databaseUrl || !endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("Production database and storage settings are required.");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = new S3Client({ endpoint, region: process.env.STORAGE_REGION ?? "auto", forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true", credentials: { accessKeyId, secretAccessKey } });
  try {
    const files = await prisma.file.findMany({ where: { company: { slug: "acme-demo" }, datasetType: { in: ENTITIES.map((entity) => entity.name) }, isActive: true, status: "READY", datasetTypeConfirmed: true }, select: { id: true, companyId: true, datasetType: true, storageKey: true, sheetIndex: true } });
    if (files.length !== ENTITIES.length) throw new Error("acme-demo must have exactly the active Returns and Return Items datasets.");
    const sources = new Map<string, { file: typeof files[number]; rows: Row[]; keys: string[] }>();
    for (const entity of ENTITIES) {
      const file = files.find((candidate) => candidate.datasetType === entity.name);
      if (!file) throw new Error(`Missing ${entity.name}.`);
      const object = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: file.storageKey }));
      if (!object.Body) throw new Error(`Missing ${entity.name} workbook body.`);
      const workbook = XLSX.read(await buffer(object.Body as AsyncIterable<Uint8Array>), { type: "buffer", cellDates: true, sheets: [file.sheetIndex] });
      const sheet = workbook.SheetNames[file.sheetIndex] ? workbook.Sheets[workbook.SheetNames[file.sheetIndex]!] : undefined;
      const rows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as Row[];
      const keys = rows.map((row) => keyOf(row, entity));
      if (rows.length !== entity.expected || keys.some((key) => !key || key.split("␟").some((part) => !part)) || new Set(keys).size !== keys.length) throw new Error(`${entity.name} source verification failed.`);
      sources.set(entity.name, { file, rows, keys });
    }
    const versions = await prisma.rieDatasetVersion.findMany({ where: { sourceFileId: { in: files.map((file) => file.id) }, entityName: { in: ENTITIES.map((entity) => entity.name) } }, select: { id: true, entityName: true, isActive: true } });
    if (process.env.RETURNS_VERIFY_ONLY === "true") {
      if (versions.length !== ENTITIES.length || versions.some((version) => !version.isActive)) throw new Error("Both active materializations are required for shadow verification.");
      for (const entity of ENTITIES) {
        const source = sources.get(entity.name)!; const version = versions.find((candidate) => candidate.entityName === entity.name)!;
        const postgres = await prisma.rieEntityRow.findMany({ where: { datasetVersionId: version.id }, select: { entityKey: true, data: true } });
        const excelByKey = new Map(source.rows.map((row, index) => [source.keys[index]!, row]));
        const dataPass = postgres.length === source.rows.length && postgres.every((row) => stableJson(excelByKey.get(row.entityKey)) === stableJson(row.data) && entity.basic.every((field) => stableJson(excelByKey.get(row.entityKey)![field]) === stableJson((row.data as Row)[field])));
        const filter = entity.name === "Returns" ? "Status" : "ReturnReason";
        const value = String(source.rows.find((row) => row[filter] !== null && row[filter] !== undefined)?.[filter] ?? "");
        const excelKeys = source.rows.filter((row) => String(row[filter] ?? "") === value).map((row) => keyOf(row, entity)).sort();
        const postgresKeys = postgres.filter((row) => String((row.data as Row)[filter] ?? "") === value).map((row) => row.entityKey).sort();
        if (!dataPass || stableJson(excelKeys) !== stableJson(postgresKeys)) throw new Error(`${entity.name} shadow verification failed.`);
      }
      const returnVersion = versions.find((version) => version.entityName === "Returns")!; const itemVersion = versions.find((version) => version.entityName === "Return Items")!;
      const [returns, items] = await Promise.all([prisma.rieEntityRow.findMany({ where: { datasetVersionId: returnVersion.id }, select: { entityKey: true } }), prisma.rieEntityRow.findMany({ where: { datasetVersionId: itemVersion.id }, select: { data: true } })]);
      const returnKeys = new Set(returns.map((row) => row.entityKey));
      if (items.some((row) => !returnKeys.has(String((row.data as Row).ReturnNo ?? "").trim()))) throw new Error("Returns ↔ Return Items relationship failed.");
      console.log("Shadow Read: PASS; filters=PASS; relationship=PASS."); return;
    }
    if (versions.length) throw new Error("Existing Returns materialization found; refusing to overwrite.");
    await prisma.$transaction(async (tx) => {
      for (const entity of ENTITIES) {
        const source = sources.get(entity.name)!; const version = await tx.rieDatasetVersion.create({ data: { companyId: source.file.companyId, sourceFileId: source.file.id, entityName: entity.name } });
        await tx.rieEntityRow.createMany({ data: source.rows.map((data, index) => ({ companyId: source.file.companyId, datasetVersionId: version.id, entityName: entity.name, entityKey: source.keys[index]!, data: data as never })) });
        const postgres = await tx.rieEntityRow.findMany({ where: { datasetVersionId: version.id }, select: { entityKey: true, data: true } }); const excel = new Map(source.rows.map((row, index) => [source.keys[index]!, row]));
        if (postgres.length !== source.rows.length || postgres.some((row) => stableJson(excel.get(row.entityKey)) !== stableJson(row.data))) throw new Error(`${entity.name} PostgreSQL verification failed.`);
        await tx.rieDatasetVersion.update({ where: { id: version.id }, data: { status: "ACTIVE", isActive: true, rowCount: source.rows.length, materializedAt: new Date(), activatedAt: new Date() } });
      }
    }, { timeout: 120_000 });
    console.log("Returns Materialization: PASS; Return Items Materialization: PASS.");
  } finally { await prisma.$disconnect(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
