import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (f) => readFileSync(f, 'utf8');
test('Railway keeps database readiness and separate migration/startup paths', () => {
  const api = JSON.parse(read('railway.api.json'));
  assert.equal(api.build.dockerfilePath, 'Dockerfile.api');
  assert.equal(api.deploy.healthcheckPath, '/health/ready');
  assert.equal(api.deploy.restartPolicyType, 'ON_FAILURE');
  for (const file of ['Dockerfile.api', 'Dockerfile.web']) {
    const commands = read(file).split('\n').filter((line) => /^(RUN|CMD|ENTRYPOINT)\b/.test(line)).join('\n');
    assert.doesNotMatch(commands, /migrate[: ]|db:seed|prisma\s+(?:db push|migrate|seed)/i);
  }
});
test('test runtime is isolated from application dependencies and release context', () => {
  for (const file of ['apps/api/package.json', 'apps/web/package.json', 'packages/database/package.json', 'packages/schemas/package.json']) {
    assert.doesNotMatch(read(file), /@electric-sql\/pglite|@field-sales-os\/quality-gates/);
  }
  for (const file of ['.dockerignore', '.gitignore']) assert.match(read(file), /^\.quality\/?\s*$/m);
  for (const excluded of ['.local-backups', '.tmp*', '.env']) assert.ok(read('.dockerignore').split(/\r?\n/).includes(excluded));
});
