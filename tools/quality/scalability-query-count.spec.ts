import assert from 'node:assert/strict';
import test from 'node:test';
import { RieScalableQueryService } from '../../apps/api/src/modules/rie/scalable-query.service';

// Actual query compiler, mocked SQL boundary: query-shape evidence, not DB latency/capacity.
test('RIE multi-customer query has constant SQL count and a bounded page as input grows', async () => {
  for (const size of [1, 20, 100]) {
    let calls = 0;
    let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
    const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => {
      calls++; captured = query; return [];
    } } as never, { resolveAllowedRouteIds: async () => new Set(['route-a']) } as never);
    await service.query({ companyId: 'synthetic-company', entityName: 'Customers',
      requestingUser: { roleCode: 'SALES_REP', email: 'rep@example.invalid' },
      projection: [{ field: 'CustomerCode' }],
      scope: { customer: { values: Array.from({ length: size }, (_, i) => `C${i}`) } },
      pagination: { limit: 20 } });
    assert.equal(calls, 1, `No SQL per customer for ${size} scoped IDs`);
    assert.match(captured?.strings?.join(' ') ?? '', /LIMIT/);
    assert.ok(captured?.values?.includes(21), '20 results plus one lookahead, not all rows');
    assert.ok(captured?.values?.includes('synthetic-company'));
    assert.ok(captured?.values?.includes('route-a'));
  }
});
