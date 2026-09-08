import { RieFsos360QueryService } from '../rie/fsos-360-query.service';
import type { Prisma } from '@field-sales-os/database';
import type { Fsos360Query } from '@field-sales-os/schemas';
import type { Fsos360ResolvedContext } from './fsos-360-context.service';

// Same opt-in ephemeral PostgreSQL runner as scalable-query.postgres.spec.ts.
// npm install --prefix <temp> --no-save --package-lock=false @electric-sql/pglite@0.5.8
// Set RIE_TEST_PGLITE_MODULE=<temp>/node_modules/@electric-sql/pglite/dist/index.cjs.
// No production database connection, tables or runtime dependency.
export const postgresTestOptions = { skip: process.env.RIE_TEST_PGLITE_MODULE ? false : 'Set RIE_TEST_PGLITE_MODULE to run PostgreSQL parity tests' };

export async function createPostgresFixture(context: Fsos360ResolvedContext, allowedRoutes: Set<string> | null = null) {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite();
  await db.exec(`CREATE TABLE files(id text PRIMARY KEY, company_id text, created_at timestamptz, is_active boolean, status text, dataset_type_confirmed boolean);
    CREATE TABLE rie_dataset_versions(id text PRIMARY KEY, company_id text, entity_name text, source_file_id text, is_active boolean);
    CREATE TABLE rie_entity_rows(id text PRIMARY KEY, company_id text, entity_name text, dataset_version_id text, entity_key text, data jsonb, created_at timestamptz);
    CREATE INDEX ON rie_entity_rows(dataset_version_id);
    CREATE INDEX ON rie_dataset_versions(company_id, entity_name, is_active);`);
  const upload = async (id: string, entity: string, rows: readonly Record<string, unknown>[], date = '2026-01-01', company = 'company-1', active = true, ready = true) => {
    await db.query(`INSERT INTO files VALUES ($1, $2, $3, $4, $5, true)`, [id, company, date, active, ready ? 'READY' : 'PROCESSING']);
    await db.query(`INSERT INTO rie_dataset_versions VALUES ($1, $2, $3, $1, true)`, [id, company, entity]);
    await db.query(`INSERT INTO rie_entity_rows SELECT $1 || '-' || n, $2, $3, $1, $1 || '-' || n, data,
      '2026-01-01'::timestamptz + n * interval '1 millisecond' FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY r(data, n)`, [id, company, entity, JSON.stringify(rows)]);
  };
  const datasets = { ...context.datasets,
    Customers: { records: [...context.customers.values()].map(c => ({ CustomerCode: c.code, CustomerName: c.name, City: c.city, BranchID: c.branchId, RouteID: c.routeId, Latitude: c.latitude, Longitude: c.longitude })) },
    Products: { records: [...context.products.values()].map(p => ({ ProductCode: p.code, ProductName: p.name, Brand: p.brand, Category: p.category })) },
  };
  for (const [entity, dataset] of Object.entries(datasets)) await upload(entity, entity, dataset.records);
  const calls: { text: string; values: unknown[]; rows: unknown[]; ms: number }[] = [];
  const service = new RieFsos360QueryService({ $queryRaw: async (query: Prisma.Sql) => {
    const start = performance.now();
    const rows = (await db.query(query.text, query.values)).rows;
    calls.push({ text: query.text, values: query.values, rows, ms: performance.now() - start });
    return rows;
  } } as never, { resolveAllowedRouteIds: async () => allowedRoutes } as never);
  return { db, service, upload, calls, close: () => db.close() };
}

export async function postgresFacts(context: Fsos360ResolvedContext, input: Fsos360Query) {
  const fixture = await createPostgresFixture(context);
  try { return await fixture.service.aggregate({ companyId: 'company-1' }, context, input); }
  finally { await fixture.close(); }
}
