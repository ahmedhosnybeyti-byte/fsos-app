import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../../packages/database/src";

class RollbackTest extends Error {}

async function main() {
  const prisma = new PrismaClient();
  let result: { inserted: number; updated: number; ignored: number } | undefined;

  try {
    const company = await prisma.company.findUniqueOrThrow({
      where: { slug: "acme-demo" },
      select: { id: true },
    });
    const entityName = "__incremental_ingestion_test__";
    const entityKey = "acme-demo";

    try {
      await prisma.$transaction(async (tx) => {
        const ingest = (data: string) => tx.$executeRaw`
          INSERT INTO "rie_canonical_entity_rows"
            ("id", "company_id", "entity_name", "entity_key", "data", "updated_at")
          VALUES (${randomUUID()}, ${company.id}, ${entityName}, ${entityKey}, ${data}::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT ("company_id", "entity_name", "entity_key")
          DO UPDATE SET "data" = EXCLUDED."data", "updated_at" = CURRENT_TIMESTAMP
          WHERE "rie_canonical_entity_rows"."data" IS DISTINCT FROM EXCLUDED."data"
        `;

        const inserted = await ingest('{"revision":1}');
        const updated = await ingest('{"revision":2}');
        const ignored = await ingest('{"revision":2}');
        if (inserted !== 1 || updated !== 1 || ignored !== 0) {
          throw new Error(`Unexpected counts: insert=${inserted}, update=${updated}, ignore=${ignored}`);
        }
        throw new RollbackTest();
      });
    } catch (error) {
      if (!(error instanceof RollbackTest)) throw error;
    }

    result = { inserted: 1, updated: 1, ignored: 0 };
  } finally {
    await prisma.$disconnect();
  }

  console.log(`acme-demo incremental ingestion PASS: insert=${result!.inserted}, update=${result!.updated}, ignore=${result!.ignored}; transaction rolled back.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
