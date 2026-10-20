import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { run } from 'node:test';
import { critical, selectTests, isSuccessful } from './policy.mjs';

const root = resolve(import.meta.dirname, '../..');
if (resolve(process.cwd()) !== root) throw new Error('Run from the repository root (official local folder: D:\\Field Sales OS).');
const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'changed';
if (!['changed', 'critical', 'postgres', 'release'].includes(mode)) throw new Error(`Unknown gate: ${mode}`);
// Invalidate old success evidence before any preflight can fail.
mkdirSync('.quality', { recursive: true });
writeFileSync(`.quality/${mode}.json`, `${JSON.stringify({ gate: mode, status: 'BLOCK', phase: 'started', startedAt: new Date().toISOString() })}\n`);
let base = 'HEAD';
if (args.length) {
  if (args.length !== 2 || args[0] !== '--base' || !/^[\w/.-]+$/.test(args[1]) || args[1].startsWith('-')) throw new Error('Usage: [changed|critical|postgres|release] [--base <git-ref>]');
  base = args[1];
}
const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean);
const changed = [...new Set([
  ...git('diff', '--name-only', '--no-renames', '-z', base, '--'),
  ...git('ls-files', '--others', '--exclude-standard', '-z', '--', 'apps', 'packages', 'tools/quality', '.github', 'AGENTS.md'),
])].sort();
function discover(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink() || ['node_modules', 'dist', '.next'].includes(entry.name)) return [];
    return entry.isDirectory() ? discover(file) : /\.(spec\.ts|test\.mjs)$/.test(file) ? [file] : [];
  });
}
// Explicit source roots keep WIP, backup tools, ad hoc scripts and seeds out.
const specs = ['apps/api/src', 'apps/web/src', 'packages/schemas/src', 'packages/database/prisma', 'tools/quality'].flatMap(discover).sort();
for (const file of critical) if (!specs.includes(file)) throw new Error(`Missing mandatory regression suite: ${file}`);
const plan = selectTests(changed, specs, mode);
const require = createRequire(import.meta.url);
let postgresModule = process.env.RIE_TEST_PGLITE_MODULE;
if (!postgresModule) {
  try { postgresModule = createRequire(resolve('packages/quality-gates/package.json')).resolve('@electric-sql/pglite'); } catch { /* fail closed below */ }
}
if (plan.needsPostgres) {
  if (!postgresModule || !existsSync(postgresModule) || !require(postgresModule).PGlite) {
    console.error('System Design Gate: BLOCK — isolated PostgreSQL test runtime missing. Supply RIE_TEST_PGLITE_MODULE; required SQL tests must not silently skip. No dependency will be installed automatically.');
    process.exit(1);
  }
}
console.log(`Engineering gate: ${mode}; ${plan.tests.length} suites; risk=${JSON.stringify(plan.risk)}`);
const started = Date.now();
// Schemas expose dist/index.js; rebuild it so tests never verify stale contracts.
const schemasBuild = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'packages/schemas/tsconfig.json'], { stdio: 'inherit', timeout: 120_000 });
if (schemasBuild.error || schemasBuild.status !== 0) {
  console.error('System Design Gate: BLOCK — shared schema compilation failed.');
  process.exit(1);
}
const counts = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0 };
// Child hook strips credentials before loading any test/application module.
if (postgresModule) process.env.RIE_TEST_PGLITE_MODULE = resolve(postgresModule);
const stream = run({ files: plan.tests.map((f) => resolve(f)), concurrency: 2,
  timeout: 120_000, execArgv: ['--require', resolve('tools/quality/test-register.cjs')] });
for await (const event of stream) {
  if (event.type === 'test:pass' || event.type === 'test:fail') {
    const data = event.data;
    if (data.skip) counts.skipped++;
    else if (data.todo) counts.todo++;
    else if (event.type === 'test:fail') {
      counts.failed++;
      console.error(`FAIL: ${data.name} (${data.file ?? ''}:${data.line ?? ''})\n${data.details?.error?.stack ?? data.details?.error ?? ''}`);
    } else counts.passed++;
  }
  if (event.type === 'test:stderr') process.stderr.write(event.data.message);
}

let typesPassed = null;
const completedTypechecks = [];
// Documentation-only changes keep the same critical core, without compilation.
const packages = mode === 'release' ? ['api', 'web', 'database', 'schemas']
  : mode === 'changed' ? [
    ...(plan.risk.api ? ['api', 'database', 'schemas'] : []), ...(plan.risk.web ? ['web'] : []),
  ] : [];
if (isSuccessful(counts)) for (const name of new Set(packages)) {
  const folder = ['api', 'web'].includes(name) ? `apps/${name}` : `packages/${name}`;
  const compiler = require.resolve('typescript/bin/tsc');
  console.log(`Typecheck: ${folder}`);
  const result = spawnSync(process.execPath, [compiler, '--noEmit', '--incremental', 'false', '-p', `${folder}/tsconfig.json`], { stdio: 'inherit', timeout: 180_000 });
  completedTypechecks.push({ package: name, passed: !result.error && result.status === 0 });
  if (result.error || result.status !== 0) { typesPassed = false; break; }
  typesPassed = true;
}
const passed = isSuccessful(counts) && typesPassed !== false;
const report = { gate: mode, status: passed ? 'PASS' : 'BLOCK', revision: git('rev-parse', 'HEAD')[0]?.trim(),
  changed, suites: plan.tests, counts, typechecks: completedTypechecks, typesPassed, durationMs: Date.now() - started,
  scope: 'Offline regressions/typechecks only; not deployment, load capacity, backup custody or release approval.' };
mkdirSync('.quality', { recursive: true });
writeFileSync(`.quality/${mode}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`System Design Gate: ${report.status}; ${JSON.stringify(counts)}; ${report.durationMs}ms. Evidence: .quality/${mode}.json`);
process.exitCode = passed ? 0 : 1;
