// Offline evidence gate only. Never connects to HTTP/PostgreSQL or starts load.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const metrics = ['apiMs', 'sqlCount', 'sqlExecutionMs', 'lockWaitMs',
  'poolWaitMs', 'rieQueueMs', 'transactionMs', 'rowsScanned', 'rowsReturned',
  'responseBytes', 'rssBytes', 'errors'];
export const checks = ['boundedReads', 'noNPlusOne', 'stockContention',
  'custodyContention', 'analyticsIngestion'];
const hex = /^[a-f0-9]{64}$/;
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/;
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const p95 = (values) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] : null;
const nonnegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const identifier = (v) => typeof v === 'string' && slug.test(v);
const statistic = (key) => ['sqlCount', 'errors', 'rowsScanned', 'rowsReturned', 'responseBytes', 'rssBytes', 'transactionMs'].includes(key) ? 'max' : 'p95';
function shape(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !keys.includes(key))) throw Error(`Invalid ${label} shape`);
}
export function validateEvidence(e) {
  shape(e, ['schemaVersion', 'revision', 'sourceDigest', 'environment', 'synthetic', 'scenarios'], 'evidence');
  if (e.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(e.revision) || !hex.test(e.sourceDigest)
    || !identifier(e.environment) || e.synthetic !== true || !Array.isArray(e.scenarios) || !e.scenarios.length) throw Error('Invalid evidence provenance');
  const ids = new Set();
  for (const s of e.scenarios) {
    shape(s, ['id', 'workload', 'dataset', 'concurrency', 'warmup', 'durationMs', 'samples', 'plans', 'checks'], 'scenario');
    if (!identifier(s.id) || ids.has(s.id) || !['read', 'write', 'mixed'].includes(s.workload)
      || !Number.isInteger(s.concurrency) || s.concurrency < 1 || !Number.isInteger(s.warmup) || s.warmup < 0
      || !nonnegative(s.durationMs) || !Array.isArray(s.samples) || !s.samples.length) throw Error('Invalid scenario');
    ids.add(s.id);
    shape(s.dataset, ['fingerprint', 'rows', 'statistics'], 'dataset');
    if (!hex.test(s.dataset.fingerprint) || !Number.isInteger(s.dataset.rows) || s.dataset.rows < 0
      || !['fresh', 'stale', 'unknown'].includes(s.dataset.statistics)) throw Error('Invalid dataset');
    for (const sample of s.samples) {
      shape(sample, metrics, 'sample');
      for (const key of metrics) if (sample[key] !== null && !nonnegative(sample[key])) throw Error(`Invalid metric ${key}`);
      for (const key of ['sqlCount', 'rowsScanned', 'rowsReturned', 'responseBytes', 'rssBytes', 'errors']) {
        if (sample[key] !== null && !Number.isInteger(sample[key])) throw Error(`Invalid count ${key}`);
      }
    }
    shape(s.checks, checks, 'checks');
    for (const key of checks) if (![true, false, null, 'not-applicable'].includes(s.checks[key])) throw Error(`Invalid check ${key}`);
    if (!Array.isArray(s.plans)) throw Error('Invalid plans');
    const planIds = new Set();
    for (const plan of s.plans) {
      shape(plan, ['id', 'indexUsed', 'rowsScanned', 'rowsReturned', 'maxFactScanLoops', 'estimateRatio'], 'plan');
      if (!identifier(plan.id) || planIds.has(plan.id) || typeof plan.indexUsed !== 'boolean'
        || ['rowsScanned', 'rowsReturned', 'maxFactScanLoops', 'estimateRatio'].some((key) => !nonnegative(plan[key]))) throw Error('Invalid plan');
      planIds.add(plan.id);
    }
  }
  return e;
}

// Includes dirty/untracked maintained code; excludes generated data, .env, .quality.
export function sourceDigest(root = process.cwd()) {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
    'AGENTS.md', '.agents/skills/murshidak-system-design', 'apps/api/src', 'apps/web/src',
    'packages/database/prisma', 'packages/schemas/src', 'tools/quality', 'package.json', 'pnpm-lock.yaml',
    '.github/workflows/engineering-reliability.yml'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const hash = createHash('sha256');
  for (const file of [...new Set(paths.split('\0').filter(Boolean))].sort()) {
    const path = resolve(root, file);
    hash.update(file).update('\0');
    if (!existsSync(path)) hash.update('DELETED');
    else if (lstatSync(path).isSymbolicLink()) throw Error('Symlink in measured source');
    else hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function validatePolicy(policy) {
  shape(policy, ['schemaVersion', 'approvals'], 'policy');
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.approvals)) throw Error('Invalid budget policy');
  const ids = new Set();
  for (const a of policy.approvals) {
    shape(a, ['scenario', 'approval', 'baselineSha256', 'minSamples', 'limits', 'planLimits'], 'approval');
    if (!identifier(a.scenario) || ids.has(a.scenario) || !identifier(a.approval) || !hex.test(a.baselineSha256)
      || !Number.isInteger(a.minSamples) || a.minSamples < 2) throw Error('Invalid approval');
    ids.add(a.scenario);
    shape(a.limits, metrics, 'limits');
    if (!Object.keys(a.limits).length) throw Error('Empty approved limits');
    for (const limit of Object.values(a.limits)) {
      shape(limit, ['max', 'regressionPercent'], 'limit');
      if (!Object.keys(limit).length || Object.values(limit).some((v) => !nonnegative(v))) throw Error('Invalid limit');
    }
    if (a.planLimits !== undefined) {
      if (!Array.isArray(a.planLimits)) throw Error('Invalid plan limits');
      const plans = new Set();
      for (const p of a.planLimits) {
        shape(p, ['id', 'maxFactScanLoops', 'maxRowsScanned', 'maxEstimateRatio', 'requireIndex'], 'plan limit');
        if (!identifier(p.id) || plans.has(p.id) || Object.keys(p).length < 2
          || ['maxFactScanLoops', 'maxRowsScanned', 'maxEstimateRatio'].some((k) => p[k] !== undefined && !nonnegative(p[k]))
          || (p.requireIndex !== undefined && typeof p.requireIndex !== 'boolean')) throw Error('Invalid plan limit');
        plans.add(p.id);
      }
    }
  }
  return policy;
}

function summarize(s) {
  return Object.fromEntries(metrics.map((key) => [key, {
    p95: s.samples.every((x) => x[key] !== null) ? p95(s.samples.map((x) => x[key])) : null,
    max: s.samples.every((x) => x[key] !== null) ? Math.max(...s.samples.map((x) => x[key])) : null,
  }]));
}
const comparisonShape = (e, s) => ({ environment: e.environment, workload: s.workload,
  dataset: s.dataset, concurrency: s.concurrency, warmup: s.warmup,
  durationMs: s.durationMs, sampleCount: s.samples.length, planIds: s.plans.map((p) => p.id).sort() });

export function evaluate({ current, baseline, baselineHash, policy, expectedDigest, expectedRevision, applicable = true }) {
  const warnings = [], failures = [], scenarios = [];
  let provenance = null;
  const result = () => ({ schemaVersion: 1, status: failures.length ? 'BLOCK' : !applicable ? 'N/A' : warnings.length ? 'WARN' : 'PASS',
    verification: failures.length ? 'FAILED' : warnings.length ? 'UNVERIFIED' : 'VERIFIED',
    sourceDigest: expectedDigest ?? null, revision: expectedRevision ?? null, provenance, warnings, failures, scenarios,
    scope: 'Measured scenarios only; functional acceptance is separate from deployment and user capacity.' });
  if (!applicable) return result();
  try {
    validatePolicy(policy);
    if (!current) { warnings.push('No current synthetic evidence or trusted comparable baseline.'); return result(); }
    validateEvidence(current);
    if (baseline) validateEvidence(baseline);
    provenance = { environment: current.environment, measuredRevision: current.revision,
      measuredSourceDigest: current.sourceDigest, baselineSha256: baselineHash ?? null };
    if (current.sourceDigest !== expectedDigest || current.revision !== expectedRevision) warnings.push('Evidence is stale for current source/revision.');
    for (const s of current.scenarios) {
      const summary = summarize(s);
      scenarios.push({ id: s.id, workload: s.workload, dataset: { ...s.dataset }, rows: s.dataset.rows,
        concurrency: s.concurrency, warmup: s.warmup, durationMs: s.durationMs, samples: s.samples.length, metrics: summary });
      for (const key of checks) {
        if (s.checks[key] === false) failures.push(`${s.id}: failed ${key}`);
        if (s.checks[key] === null) warnings.push(`${s.id}: untested ${key}`);
      }
      for (const key of metrics) if (summary[key].p95 === null) warnings.push(`${s.id}: unmeasured ${key}`);
      if (s.samples.length < 2) warnings.push(`${s.id}: single observation is not percentile evidence.`);
      if (!s.plans.length) warnings.push(`${s.id}: native query plans missing.`);
      if (s.dataset.statistics === 'unknown') warnings.push(`${s.id}: unknown statistics; representative plans unverified.`);
      const approval = policy.approvals.find((a) => a.scenario === s.id);
      const b = baseline?.scenarios.find((x) => x.id === s.id);
      const comparable = b && isDeepStrictEqual(comparisonShape(current, s), comparisonShape(baseline, b));
      if (!approval) { warnings.push(`${s.id}: no approved limits/baseline; observations only.`); continue; }
      // Absolute approved budgets remain enforceable without a comparable baseline.
      for (const [key, limit] of Object.entries(approval.limits)) {
        const measured = summary[key][statistic(key)];
        if (measured === null) { failures.push(`${s.id}: approved metric ${key} missing`); continue; }
        if (limit.max !== undefined && measured > limit.max) failures.push(`${s.id}: ${key} exceeds approved maximum`);
      }
      for (const limit of approval.planLimits ?? []) {
        const p = s.plans.find((x) => x.id === limit.id);
        if (!p) { failures.push(`${s.id}: approved plan missing`); continue; }
        if ((limit.requireIndex && !p.indexUsed)
          || (limit.maxFactScanLoops !== undefined && p.maxFactScanLoops > limit.maxFactScanLoops)
          || (limit.maxRowsScanned !== undefined && p.rowsScanned > limit.maxRowsScanned)
          || (limit.maxEstimateRatio !== undefined && p.estimateRatio > limit.maxEstimateRatio)) failures.push(`${s.id}: plan exceeds approved limits`);
      }
      if (!baseline || baselineHash !== approval.baselineSha256 || !comparable) {
        warnings.push(`${s.id}: baseline not approved or workload/environment/data/statistics not comparable.`); continue;
      }
      if (s.samples.length < approval.minSamples || b.samples.length < approval.minSamples) warnings.push(`${s.id}: below approved sample count.`);
      const before = summarize(b);
      for (const [key, limit] of Object.entries(approval.limits)) {
        const stat = statistic(key);
        if (limit.regressionPercent === undefined) continue;
        if (before[key][stat] === null) { warnings.push(`${s.id}: baseline ${key} missing.`); continue; }
        if (summary[key][stat] !== null && summary[key][stat] > before[key][stat] * (1 + limit.regressionPercent / 100)) failures.push(`${s.id}: ${key} exceeds approved regression`);
      }
    }
    for (const a of policy.approvals) if (!current.scenarios.some((s) => s.id === a.scenario)) warnings.push(`${a.scenario}: approved scenario absent; coverage incomplete.`);
  } catch {
    // Do not echo input, parser messages, SQL text, tokens or customer payloads.
    failures.push('Invalid evidence or budget contract; input details withheld.');
  }
  return result();
}

export function assessFiles({ root = process.cwd(), applicable = true, evidence = '.quality/scalability/current.json', baseline = '.quality/scalability/baseline.json' } = {}) {
  try {
    const policy = JSON.parse(readFileSync(resolve(root, 'tools/quality/scalability-budgets.json'), 'utf8'));
    const load = (file) => existsSync(resolve(root, file)) ? readFileSync(resolve(root, file), 'utf8') : null;
    const raw = load(evidence), before = load(baseline);
    return evaluate({ applicable, policy, current: raw ? JSON.parse(raw) : null, baseline: before ? JSON.parse(before) : null,
      baselineHash: before ? sha256(before) : null, expectedDigest: applicable ? sourceDigest(root) : null,
      expectedRevision: applicable ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() : null });
  } catch {
    return { schemaVersion: 1, status: 'BLOCK', verification: 'FAILED', warnings: [],
      failures: ['Unable to read scalability evidence/policy/source; details withheld.'], scenarios: [] };
  }
}
export function saveAssessment(report, root = process.cwd(), outputDirectory = '.quality/scalability') {
  const out = resolve(root, outputDirectory);
  mkdirSync(resolve(out, 'runs'), { recursive: true });
  const body = JSON.stringify({ ...report, assessedAt: new Date().toISOString() }, null, 2) + '\n';
  writeFileSync(resolve(out, 'latest.json'), body);
  writeFileSync(resolve(out, 'runs', `${Date.now()}-${sha256(body).slice(0, 12)}.json`), body);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..');
  if (resolve(process.cwd()) !== root) throw Error('Run from repository root.');
  const args = process.argv.slice(2), options = { root };
  let required = false, fingerprintOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--require-verified') required = true;
    else if (args[i] === '--fingerprint') fingerprintOnly = true;
    else if (['--evidence', '--baseline', '--output-directory'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = args[i] === '--output-directory' ? 'outputDirectory' : args[i].slice(2);
      options[key] = args[++i];
    } else throw Error('Usage: [--evidence file] [--baseline file] [--output-directory dir] [--require-verified] [--fingerprint]');
  }
  if (fingerprintOnly) console.log(sourceDigest(root));
  else {
    const report = assessFiles(options);
    saveAssessment(report, root, options.outputDirectory);
    console.log(`Scalability Gate: ${report.status} (${report.verification}); sanitized assessment saved.`);
    process.exitCode = report.status === 'BLOCK' || (required && report.status !== 'PASS') ? 1 : 0;
  }
}
