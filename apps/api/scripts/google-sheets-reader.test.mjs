import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTestOpportunity, READONLY_SCOPE } from './google-sheets-reader.mjs';
const env = { GOOGLE_SHEETS_CLIENT_EMAIL: 'test@example.iam.gserviceaccount.com', GOOGLE_SHEETS_PRIVATE_KEY: 'fake-test-key' };
test('fails closed without credentials', async () => {
  await assert.rejects(readTestOpportunity({}), /Set GOOGLE_SHEETS_CLIENT_EMAIL/);
  assert.equal(READONLY_SCOPE, 'https://www.googleapis.com/auth/spreadsheets.readonly');
});
test('one bounded GET returns only the exact matching row', async () => {
  let calls = 0;
  const result = await readTestOpportunity(env, { client: { request: async options => {
    calls++;
    assert.equal(options.method, 'GET');
    assert.ok(decodeURIComponent(options.url).endsWith("'Sheet1'!A1:AZ101"));
    assert.equal(options.retry, false);
    return { data: { values: [['id', 'name'], ['TEST-AUTO-001-extra', 'excluded'], ['TEST-AUTO-001', 'Opportunity']] } };
  } } });
  assert.equal(calls, 1);
  assert.equal(result.record.rowNumber, 3);
  assert.deepEqual(result.record.values, ['TEST-AUTO-001', 'Opportunity']);
  assert.equal(result.rowsReturned, 1);
});
test('missing result is limited to the bounded test window', async () => {
  const result = await readTestOpportunity(env, { client: { request: async () => ({ data: {} }) } });
  assert.equal(result.found, false);
  assert.match(result.message, /rest of the sheet was not scanned/);
});
test('rejects ambiguous matches', async () => {
  await assert.rejects(readTestOpportunity(env, { client: { request: async () => ({ data: { values: [['id'], ['TEST-AUTO-001'], ['TEST-AUTO-001']] } }) } }), /Multiple rows/);
});
test('redacts SDK error details', async () => {
  await assert.rejects(readTestOpportunity(env, { client: { request: async () => {
    throw Object.assign(new Error('Authorization: secret-token private-key'), { response: { status: 403 } });
  } } }), error => !error.message.includes('secret-token') && !error.message.includes('private-key') && error.message.includes('Viewer'));
});
test('rejects oversized results', async () => {
  await assert.rejects(readTestOpportunity(env, { client: { request: async () => ({ data: { values: Array.from({ length: 102 }, () => []) } }) } }), /oversized/);
});
