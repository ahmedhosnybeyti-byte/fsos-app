import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluate, metrics, checks, p95, sha256, validateEvidence } from './scalability.mjs';
import { critical, selectTests, acceptanceResult } from './policy.mjs';

// All numbers/budgets below are test-only inputs, never Murshidak SLOs.
const digest = 'a'.repeat(64), revision = 'b'.repeat(40);
function fixture() {
  const sample = Object.fromEntries(metrics.map((k) => [k, 1]));
  return { schemaVersion: 1, revision, sourceDigest: digest, environment: 'synthetic-test-runtime', synthetic: true,
    scenarios: [{ id: 'test-only', workload: 'mixed', dataset: { fingerprint: 'c'.repeat(64), rows: 200, statistics: 'fresh' },
      concurrency: 2, warmup: 3, durationMs: 1000, samples: Array.from({ length: 25 }, () => ({ ...sample })),
      plans: [{ id: 'scoped-fact', indexUsed: true, rowsScanned: 200, rowsReturned: 1, maxFactScanLoops: 1, estimateRatio: 1 }],
      checks: Object.fromEntries(checks.map((k) => [k, true])) }] };
}
function setup() {
  const baseline = fixture(), current = fixture();
  return { baseline, current, baselineHash: sha256(JSON.stringify(baseline)), expectedDigest: digest, expectedRevision: revision,
    policy: { schemaVersion: 1, approvals: [{ scenario: 'test-only', approval: 'test-fixture-only',
      baselineSha256: sha256(JSON.stringify(baseline)), minSamples: 25,
      limits: Object.fromEntries(metrics.map((k) => [k, { max: 2, regressionPercent: 10 }])),
      planLimits: [{ id: 'scoped-fact', maxFactScanLoops: 1, maxRowsScanned: 200, maxEstimateRatio: 2, requireIndex: true }] }] } };
}
test('nearest-rank p95 excludes any invented single-request capacity inference', () => {
  assert.equal(p95([]), null); assert.equal(p95(Array.from({ length: 100 }, (_, i) => i + 1)), 95);
  const input = setup(); input.current.scenarios[0].samples.length = 1;
  assert.equal(evaluate(input).status, 'WARN');
});
test('only comparable trusted complete evidence passes; missing evidence/budgets warn', () => {
  const verified = evaluate(setup());
  assert.equal(verified.status, 'PASS');
  assert.equal(verified.provenance.environment, 'synthetic-test-runtime');
  assert.equal(verified.sourceDigest, digest);
  assert.deepEqual(verified.scenarios[0].dataset, fixture().scenarios[0].dataset);
  assert.equal(evaluate({ ...setup(), current: null }).status, 'WARN');
  assert.equal(evaluate({ ...setup(), baseline: null }).status, 'WARN');
  assert.equal(evaluate({ ...setup(), policy: { schemaVersion: 1, approvals: [] } }).status, 'WARN');
  assert.equal(evaluate({ ...setup(), applicable: false }).status, 'N/A');
});
test('required runner propagates regressions; release refuses WARN and functional failures always block', () => {
  assert.deepEqual(acceptanceResult(true, 'WARN', 'changed'), { passed: true, status: 'WARN' });
  for (const mode of ['changed', 'critical', 'postgres', 'release']) {
    assert.deepEqual(acceptanceResult(true, 'BLOCK', mode), { passed: false, status: 'BLOCK' });
    assert.deepEqual(acceptanceResult(false, 'WARN', mode), { passed: false, status: 'BLOCK' });
  }
  assert.deepEqual(acceptanceResult(true, 'WARN', 'release'), { passed: false, status: 'BLOCK' });
});
test('approved p95, SQL/N+1, pool, lock, RIE, transaction, scan and memory regressions block', () => {
  for (const key of metrics) {
    const input = setup(); input.current.scenarios[0].samples.forEach((s) => { s[key] = 3; });
    const result = evaluate(input);
    assert.equal(result.status, 'BLOCK', key);
    assert.ok(result.failures.some((f) => f.includes(key)), key);
  }
});
test('relative approved regression blocks even below absolute maximum', () => {
  const input = setup(); input.current.scenarios[0].samples.forEach((s) => { s.apiMs = 1.5; });
  assert.ok(evaluate(input).failures.some((f) => f.includes('apiMs exceeds approved regression')));
});
test('one unbounded response, N+1 spike or long transaction cannot hide behind p95', () => {
  for (const key of ['sqlCount', 'rowsReturned', 'rowsScanned', 'transactionMs']) {
    const input = setup(); input.current.scenarios[0].samples[0][key] = 500;
    assert.equal(evaluate(input).status, 'BLOCK', key);
  }
  for (const key of checks) {
    const input = setup(); input.current.scenarios[0].checks[key] = false;
    assert.equal(evaluate(input).status, 'BLOCK', key);
  }
});
test('unknown waits are not zero, and RIE/SQL timings remain independent', () => {
  for (const key of ['sqlExecutionMs', 'rieQueueMs', 'poolWaitMs', 'lockWaitMs']) {
    const input = setup(); input.current.scenarios[0].samples[0][key] = null;
    assert.equal(evaluate(input).status, 'BLOCK'); // required approved metric missing
    input.policy.approvals = [];
    assert.equal(evaluate(input).status, 'WARN');
  }
  const input = setup(); input.current.scenarios[0].samples.forEach((s) => { s.rieQueueMs = 3; });
  const result = evaluate(input);
  assert.equal(result.scenarios[0].metrics.sqlExecutionMs.p95, 1);
  assert.equal(result.scenarios[0].metrics.rieQueueMs.p95, 3);
});
test('different data/growth/statistics/environment/concurrency/warmup/duration cannot claim comparison', () => {
  const changes = [
    (i) => { i.current.environment = 'other-machine'; },
    (i) => { i.current.scenarios[0].dataset.rows = 2000; },
    (i) => { i.current.scenarios[0].dataset.fingerprint = 'd'.repeat(64); },
    (i) => { i.current.scenarios[0].dataset.statistics = 'stale'; },
    (i) => { i.current.scenarios[0].concurrency = 150; },
    (i) => { i.current.scenarios[0].warmup = 0; },
    (i) => { i.current.scenarios[0].durationMs = 2000; },
    (i) => { i.current.scenarios[0].workload = 'read'; },
    (i) => { i.baselineHash = 'd'.repeat(64); },
    (i) => { i.expectedDigest = 'd'.repeat(64); },
    (i) => { i.expectedRevision = 'd'.repeat(40); },
  ];
  for (const change of changes) { const input = setup(); change(input); assert.equal(evaluate(input).status, 'WARN'); }
  // A separately approved, measured stale-statistics scenario can verify its own
  // contract; it must never be compared to a freshly analyzed baseline.
  const stale = setup();
  stale.current.scenarios[0].dataset.statistics = 'stale';
  stale.baseline.scenarios[0].dataset.statistics = 'stale';
  stale.baselineHash = sha256(JSON.stringify(stale.baseline));
  stale.policy.approvals[0].baselineSha256 = stale.baselineHash;
  assert.equal(evaluate(stale).status, 'PASS');
});
test('approved fact-scan/index/estimate budgets fail and missing plans cannot pass', () => {
  for (const [key, value] of [['maxFactScanLoops', 20], ['rowsScanned', 2000], ['estimateRatio', 100], ['indexUsed', false]]) {
    const input = setup(); input.current.scenarios[0].plans[0][key] = value;
    assert.equal(evaluate(input).status, 'BLOCK', key);
  }
  const input = setup(); input.current.scenarios[0].plans = [];
  assert.equal(evaluate(input).status, 'BLOCK');
});
test('invalid/secret-bearing input fails without echoing raw values', () => {
  for (const mutate of [
    (i) => { i.current.token = 'sensitive-test-sentinel'; },
    (i) => { i.current.scenarios[0].samples[0].apiMs = -1; },
    (i) => { delete i.current.scenarios[0].samples[0].poolWaitMs; },
    (i) => { i.current.scenarios.push(i.current.scenarios[0]); },
    (i) => { i.current.synthetic = false; },
    (i) => { i.policy.approvals[0].limits.apiMs.max = -1; },
  ]) {
    const input = setup(); mutate(input); const r = evaluate(input);
    assert.equal(r.status, 'BLOCK'); assert.doesNotMatch(JSON.stringify(r), /sensitive-test-sentinel/);
  }
});
test('absent approved scenario and missing concurrency/coexistence tests remain unverified', () => {
  const input = setup(); input.policy.approvals.push({ ...input.policy.approvals[0], scenario: 'other-scenario' });
  assert.equal(evaluate(input).status, 'WARN');
  input.policy.approvals.pop(); input.current.scenarios[0].checks.analyticsIngestion = null;
  assert.equal(evaluate(input).status, 'WARN');
});
test('fresh process deliberately exceeds a test-approved p95 limit and exits nonzero', () => {
  const input = setup(); input.current.scenarios[0].samples.forEach((s) => { s.apiMs = 100; });
  const code = `import { evaluate } from './tools/quality/scalability.mjs';
    let raw=''; for await (const chunk of process.stdin) raw+=chunk;
    const r=evaluate(JSON.parse(raw)); console.log(JSON.stringify(r)); process.exitCode=r.status==='BLOCK'?1:0;`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 1);
  const r = JSON.parse(child.stdout); assert.equal(r.status, 'BLOCK');
  assert.ok(r.failures.includes('test-only: apiMs exceeds approved maximum'));
});
test('real CLI missing evidence is WARN, strict acceptance and malformed input exit nonzero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'murshidak-scalability-'));
  try {
    const absent = join(dir, 'absent.json'), bad = join(dir, 'bad.json');
    writeFileSync(bad, '{"secret":"sensitive-test-sentinel"}');
    const run = (...args) => spawnSync(process.execPath, ['tools/quality/scalability.mjs', '--output-directory', join(dir, 'results'), ...args], { encoding: 'utf8', timeout: 20_000 });
    const warn = run('--evidence', absent, '--baseline', absent);
    assert.equal(warn.status, 0); assert.match(warn.stdout, /WARN \(UNVERIFIED\)/);
    assert.equal(run('--evidence', absent, '--require-verified').status, 1);
    const blocked = run('--evidence', bad);
    assert.equal(blocked.status, 1); assert.match(blocked.stdout, /BLOCK/);
    assert.doesNotMatch(blocked.stdout + blocked.stderr, /sensitive-test-sentinel/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('permanent root instruction, discoverable skill and CI retain the executable contract', () => {
  const read = (p) => readFileSync(p, 'utf8');
  assert.match(read('AGENTS.md'), /## Mandatory Murshidak Scalability Gate/);
  assert.match(read('AGENTS.md'), /\.agents\/skills\/murshidak-system-design\/SKILL.md/);
  const skill = read('.agents/skills/murshidak-system-design/SKILL.md');
  assert.match(skill, /^---\r?\nname: murshidak-system-design/m);
  assert.match(skill, /SCALABILITY_GATE.md/); assert.match(skill, /Scalability Gate: PASS \/ WARN \/ BLOCK/);
  assert.match(read('docs/engineering/SCALABILITY_GATE.md'), /UNVERIFIED/);
  assert.ok(critical.includes('tools/quality/scalability.test.mjs'));
  assert.match(read('tools/quality/run.mjs'), /assessFiles/);
  assert.match(read('.github/workflows/engineering-reliability.yml'), /scalability\/latest.json/);
});
test('impactful paths and inline fetching select scalability; prose/style does not start load', () => {
  for (const f of ['apps/api/src/modules/wms/x.ts', 'apps/api/src/modules/accounting/x.ts',
    'apps/api/src/modules/files/ingestion.ts', 'packages/database/prisma/x.sql', 'apps/web/src/lib/api/x.ts']) {
    assert.equal(selectTests([f], [], 'changed', () => '').risk.scalability, true, f);
  }
  assert.equal(selectTests(['apps/web/src/app/page.tsx'], [], 'changed', () => 'fetch(url)').risk.scalability, true);
  assert.equal(selectTests(['docs/example.md'], [], 'changed').risk.scalability, false);
  assert.equal(selectTests(['apps/web/src/app/page.tsx'], [], 'changed', () => '<p>text</p>').risk.scalability, false);
  assert.equal(selectTests(['apps/web/src/app/style.css'], [], 'changed').risk.scalability, false);
  assert.doesNotThrow(() => validateEvidence(fixture()));
});
