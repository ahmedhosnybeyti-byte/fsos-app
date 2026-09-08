import { strict as assert } from 'node:assert';
import test from 'node:test';
import type { Fsos360Query } from '@field-sales-os/schemas';
import { Fsos360WorkspaceService } from './fsos-360-workspace.service';
import { Fsos360WorkspaceService as LegacyWorkspace } from './fsos-360-legacy.spec';
import type { Fsos360ResolvedContext } from './fsos-360-context.service';
import { createPostgresFixture, postgresTestOptions } from './fsos-360-postgres.fixture.spec';

const available = (records: Record<string, unknown>[] = []) => ({ available: true, records });
function scenario(): Fsos360ResolvedContext {
  const customers = new Map(Array.from({ length: 805 }, (_, i) => {
    const code = `c-${805 - i}`;
    return [code, { code, name: ['زبون', 'alpha', 'Alpha', 'éclair', 'Zebra'][i % 5]!, city: i % 2 ? 'Jeddah' : 'Riyadh', branchId: i % 2 ? 'b-2' : 'b-1', routeId: i % 3 ? 'route-a' : 'route-b', latitude: i < 3 ? null : 21, longitude: i < 3 ? null : 39 }] as const;
  }));
  const products = new Map(Array.from({ length: 51 }, (_, i) => {
    const code = `p-${i}`;
    return [code, { code, name: `Product ${i}`, brand: i % 3 ? 'Brand' : '', category: i ? `Category ${i}` : '' }] as const;
  }));
  const codes = [...customers.keys()];
  const invoices: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const collections: Record<string, unknown>[] = [];
  const returns: Record<string, unknown>[] = [];
  const visits: Record<string, unknown>[] = [];
  for (const [i, code] of codes.entries()) {
    const date = i % 5 === 0 ? '2025-12-15' : '2026-01-15';
    const route = i % 4 === 0 ? '' : i % 3 ? 'route-a' : 'route-b';
    invoices.push({ InvoiceNo: `i-${i}`, CustomerCode: code, RouteID: route, InvoiceDate: date });
    items.push({ InvoiceNo: `i-${i}`, ProductCode: `p-${i % 51}`, LineTotal: i % 7 === 0 ? -12.5 : '1,000.25', LineNo: 1 });
    collections.push({ CollectionID: `coll-${i}`, CustomerCode: code, RouteID: route, CollectionDate: date, Amount: i % 7 ? '13.25' : -2 });
    returns.push({ ReturnID: `ret-${i}`, CustomerCode: code, RouteID: route, ReturnDate: date, TotalAmount: i % 3 ? 0.1 : 'invalid' });
    visits.push({ VisitID: `visit-${i}`, CustomerCode: code, RouteID: route, VisitDate: date, VisitStatus: i % 3 ? ' Productive ' : 'productive' });
  }
  // Last duplicate invoice wins; trim but DO NOT case-fold the fact join.
  invoices.push({ InvoiceNo: ' dup ', CustomerCode: codes[0], RouteID: 'route-a', InvoiceDate: '2025-12-01' },
    { InvoiceNo: 'dup', CustomerCode: codes[1], RouteID: 'route-b', InvoiceDate: '2026-01-01' },
    { InvoiceNo: 'Case', CustomerCode: codes[2], RouteID: '', InvoiceDate: '2026-01-31' },
    { InvoiceNo: 'bad', CustomerCode: codes[2], InvoiceDate: 'invalid' },
    { InvoiceNo: '', CustomerCode: codes[2], InvoiceDate: '2026-01-01' });
  items.push({ InvoiceNo: 'dup', ProductCode: 'missing', LineTotal: 1e16 }, { InvoiceNo: 'dup', ProductCode: 'missing', LineTotal: -1e16 },
    { InvoiceNo: 'dup', ProductCode: 'missing', LineTotal: 0.1 }, { InvoiceNo: 'dup', ProductCode: 'missing', LineTotal: 0.2 },
    { InvoiceNo: 'case', LineTotal: 99 }, { InvoiceNo: 'Case', LineTotal: 17 }, { InvoiceNo: 'bad', LineTotal: 999 }, { InvoiceNo: '', LineTotal: 999 });
  for (const [i, date] of [Date.parse('2026-01-01T12:00Z'), '2026-01-31T00:00:00.001Z', '2026-01-01T23:59:59Z', null, 'not-a-date'].entries()) {
    invoices.push({ InvoiceNo: `edge-${i}`, CustomerCode: codes[0], RouteID: 'route-a', InvoiceDate: date });
    items.push({ InvoiceNo: `edge-${i}`, ProductCode: 'p-0', LineTotal: 2.5 });
  }
  return {
    filters: { companyId: 'company-1' }, removedSelections: {}, activeAnalysisLevel: 'company', customerCount: customers.size,
    customers, products, branches: new Map([['b-1', { name: 'B1', regionId: 'r-1' }], ['b-2', { name: 'B2', regionId: 'r-2' }]]), regions: new Map([['r-1', 'R1'], ['r-2', 'R2']]),
    routes: new Map(['route-a', 'route-b'].map(id => [id, { id, name: id, branchId: 'b-1', salesRepId: 'rep-2' }])),
    employees: new Map([['rep-1', { id: 'rep-1', name: 'Rep', managerId: 'supervisor', branchId: 'b-1' }], ['supervisor', { id: 'supervisor', name: 'Supervisor', managerId: 'manager', branchId: 'b-1' }]]),
    routeAssignments: [{ routeId: 'route-a', employeeId: 'rep-1', role: 'SalesRep', startAt: Date.parse('2025-01-01'), endAt: Date.parse('2026-01-15') }, { routeId: 'route-a', employeeId: 'rep-2', role: 'SalesRep', startAt: Date.parse('2026-01-15'), endAt: null }],
    datasets: { Companies: available(), Regions: available(), Branches: available(), Employees: available(), Routes: available(), 'Route Assignments': available(), Customers: available(), Products: available(), Invoices: available(invoices), 'Invoice Items': available(items), Collections: available(collections), Returns: available(returns), Visits: available(visits), Targets: available([{ RouteID: 'route-a', Year: 2026, Month: 1, SalesTarget: 1000 }, { RouteID: 'route-b', Year: 2026, Month: 1, SalesTarget: 2000 }]) },
    smallFilterOptions: {}, capabilities: { routeAssignments: { availability: 'available', available: true, reason: null } },
  } as unknown as Fsos360ResolvedContext;
}
const periods: Fsos360Query = { currentPeriod: { from: '2026-01-01', to: '2026-01-31' }, comparisonPeriod: { from: '2025-12-01', to: '2025-12-31' }, filters: {} };
const stable = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'generatedAt' ? undefined : item));

test('FSOS 360 full-response differential parity against f808491 on real PostgreSQL', postgresTestOptions, async t => {
  const ctx = scenario();
  const fixture = await createPostgresFixture(ctx);
  t.after(() => fixture.close());
  const adapter = {
    resolve: async () => ctx,
    aggregateFacts: async (_user: unknown, context: Fsos360ResolvedContext, input: Fsos360Query) => fixture.service.aggregate({ companyId: 'company-1' }, context, input),
    customerOptions: async (_user: unknown, context: Fsos360ResolvedContext, input: any, candidates?: string[]) => fixture.service.customerOptions({ companyId: 'company-1' }, context.filters, context.branches, input, candidates),
  };
  const sgi = { getLatest: async () => ({ situations: [{ entityType: 'customer', entityKey: ' c-805 ', type: 'LOST_SALES', metricValue: 1, metricValuePrior: 3 }, { entityType: 'customer', entityKey: 'absent', type: 'LOST_SALES', metricValue: 9 }] }) };
  const legacy = new LegacyWorkspace(adapter as never, sgi as never);
  const current = new Fsos360WorkspaceService(adapter as never, sgi as never);
  const compare = async (input: Fsos360Query) => assert.deepEqual(stable(await current.query({} as never, input)), stable(await legacy.query({} as never, input)));
  for (const preferredType of ['line', 'timeline', 'bar', 'treemap', 'heat-map', 'coverage-map', 'route-map', 'customer-density'] as const) {
    await t.test(preferredType, () => compare({ ...periods, visualization: { preferredType } }));
  }
  for (const metric of ['collections', 'returns'] as const) await t.test(`heat-map ${metric}`, () => compare({ ...periods, visualization: { preferredType: 'heat-map', metric } }));
  await t.test('brand treemap', () => compare({ ...periods, visualization: { preferredType: 'treemap', groupBy: 'brand' } }));
  for (const filters of [{ routeIds: ['route-a'] }, { cityValues: ['Jeddah'], regionIds: ['r-2'] }, { branchIds: ['b-1'], customerCodes: ['c-805'] }, { productCodes: ['p-1'] }, { brandValues: ['Brand'], categoryValues: ['Category 2'] }, { salesRepIds: ['rep-1'], routeIds: ['route-a'] }, { managerIds: ['manager'], supervisorIds: ['supervisor'], routeIds: ['route-a'] }, { routeIds: ['missing'] }]) {
    ctx.filters = { companyId: 'company-1', ...filters };
    await t.test(`filters ${JSON.stringify(filters)}`, () => compare({ ...periods, visualization: { preferredType: 'customer-density' } }));
  }
  ctx.filters = { companyId: 'company-1' };
  for (const currentPeriod of [{ from: '2026-01-01T12:00:00Z', to: '2026-01-31T12:00:00Z' }, { from: '2025-11-01', to: '2026-02-01' }, { from: '2025-01-01', to: '2026-02-01' }, { from: '2026-01-01', to: '2026-01-01' }]) {
    await t.test(`period ${JSON.stringify(currentPeriod)}`, () => compare({ ...periods, currentPeriod, comparisonPeriod: currentPeriod }));
  }
  for (const name of ['Invoices', 'Invoice Items', 'Collections', 'Returns', 'Visits'] as const) {
    ctx.datasets[name].available = false;
    await t.test(`missing ${name}`, () => compare(periods));
    ctx.datasets[name].available = true;
  }
  for (const analysisFocus of ['manager', 'supervisor', 'sales-rep', 'route', 'customer', 'brand', 'product', 'category', 'mixed'] as const) {
    ctx.activeAnalysisLevel = analysisFocus;
    await t.test(`focus ${analysisFocus}`, () => compare(periods));
  }
  ctx.activeAnalysisLevel = 'company';
  for (const query of ['', 'ALPHA', 'زبون', '%', 'Riyadh', 'c-80']) {
    for (const page of [1, 2, 50]) {
      const input = { field: 'customer' as const, query, page, pageSize: 17, context: periods };
      await t.test(`customer filter ${query}/${page}`, async () => assert.deepEqual(await current.filterOptions({} as never, input), await legacy.filterOptions({} as never, input)));
    }
  }
  const aggregateCalls = fixture.calls.filter(call => call.text.includes('invoices_scoped'));
  assert.ok(aggregateCalls.length > 30);
  for (const call of aggregateCalls) {
    assert.equal(call.rows.length, 1);
    const result = (call.rows[0] as any).result;
    assert.equal(result.periods.length, 2);
    assert.ok(result.categories.length <= 40 && result.treemap.length <= 20 && result.geo.points.length <= 750);
    assert.ok(call.text.includes('GROUP BY') && call.text.includes('INNER JOIN') && call.text.includes('BETWEEN'));
    assert.ok(JSON.stringify(result).length < 160000);
  }
});
