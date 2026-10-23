import { Prisma } from "@field-sales-os/database";

// Scalar display metadata from the already-scoped product, not a catalogue read.
// Call only inside an existing bounded result projection; no data/schema writes.
export function productCategory(company:Prisma.Sql,code:Prisma.Sql) {
  return Prisma.sql`(SELECT NULLIF(btrim(category_source.data->>'Category'),'')
    FROM rie_canonical_entity_rows category_source
    WHERE category_source.company_id=${company} AND category_source.entity_name='Products'
      AND category_source.entity_key=${code})`;
}
