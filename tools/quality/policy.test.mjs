import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, selectTests, isSuccessful, critical } from './policy.mjs';

test('documentation runs the mandatory core without typechecks or database fixtures', () => {
  const plan = selectTests(['docs/engineering/example.md'], [], 'changed');
  assert.deepEqual(plan.tests, [...critical].sort());
  assert.equal(plan.needsPostgres, false);
  assert.ok(Object.values(plan.risk).every((value) => value === false));
});
test('DB, query, tenant-mode and ERP edits cannot bypass conditional suites', () => {
  const specs = ['apps/api/src/modules/rie/scalable-query.postgres.spec.ts', 'apps/api/src/modules/rie/scalable-query.service.spec.ts'];
  const read = () => '';
  for (const file of ['packages/database/prisma/schema.prisma', 'apps/api/src/modules/rie/service.ts', 'apps/api/src/modules/sfa-setup/service.ts', 'apps/api/src/modules/companies/service.ts']) {
    const plan = selectTests([file], specs, 'changed', read);
    assert.equal(plan.needsPostgres, true); assert.ok(plan.tests.includes(specs[0]));
  }
  assert.equal(classify(['apps/api/src/modules/payments/service.ts']).erp, true);
  assert.equal(classify(['apps/api/src/modules/assistant/service.ts']).ai, true);
});
test('SQL fixtures hidden in ordinary filenames remain required, and release selects all tests', () => {
  const specs = ['apps/api/src/modules/rie/mixed.spec.ts', 'apps/web/src/lib/example.spec.ts'];
  const read = (f) => f.includes('mixed') ? 'RIE_TEST_PGLITE_MODULE' : '';
  assert.equal(selectTests(['apps/api/src/modules/rie/query.ts'], specs, 'changed', read).needsPostgres, true);
  assert.deepEqual(selectTests([], specs, 'release', read).tests, specs);
});
test('critical skips, todos, cancellation, empty selection and failures block readiness', () => {
  const good = { passed: 4, failed: 0, skipped: 0, todo: 0, cancelled: 0 };
  assert.equal(isSuccessful(good), true);
  assert.equal(isSuccessful({ ...good, passed: 0 }), false);
  for (const key of ['failed', 'skipped', 'todo', 'cancelled']) assert.equal(isSuccessful({ ...good, [key]: 1 }), false);
});
