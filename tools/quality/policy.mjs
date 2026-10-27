import { readFileSync } from 'node:fs';

export const critical = [
  'apps/api/src/common/guards/company-screen-access.guard.spec.ts',
  'apps/api/src/common/guards/sfa-access.guard.spec.ts',
  'apps/api/src/common/security/redact-request-trace-url.spec.ts',
  'apps/api/src/common/security/redact-sensitive-url.spec.ts',
  'apps/api/src/modules/auth/auth.service.spec.ts',
  'apps/api/src/modules/auth/tokens.service.spec.ts',
  'apps/api/src/modules/auth/strategies/jwt-access.strategy.spec.ts',
  'apps/api/src/modules/audit-log/audit-log.service.spec.ts',
  'apps/api/src/modules/health/health.service.spec.ts',
  'apps/api/src/modules/rie/rie-execution-coordinator.service.spec.ts',
  'apps/api/src/modules/rie/rie-request-planner.service.spec.ts',
  'apps/api/src/modules/sfa-setup/sfa-setup.controller.spec.ts',
  'apps/api/src/modules/sfa-setup/sfa-setup.service.spec.ts',
  'apps/api/src/modules/companies/company-operating-settings.service.spec.ts',
  'apps/api/src/modules/prospects/gemini-intelligence.service.spec.ts',
  'apps/web/src/lib/auth-routing.spec.ts',
  'apps/web/src/lib/files-permissions.spec.ts',
  'apps/web/src/lib/sfa-preview-access.spec.ts',
  'packages/database/prisma/seed-security.spec.ts',
  'packages/schemas/src/company-feature-access.schemas.spec.ts',
  'tools/quality/policy.test.mjs',
  'tools/quality/repository-contracts.test.mjs',
  'tools/quality/admission.spec.ts',
];

export function isPostgresSpec(file, read = readFileSync) {
  return /postgres.*\.spec\.ts$/.test(file)
    || (file.endsWith('.ts') && read(file, 'utf8').includes('RIE_TEST_PGLITE_MODULE'));
}

// Conservative path selection, not a proof that arbitrary code is safe.
// Shared query/config changes deliberately run broader suites.
export function classify(files) {
  const code = files.filter((f) => /^(apps|packages|tools)\//.test(f) || /^(package\.json|pnpm-lock\.yaml|turbo\.json|Dockerfile|railway\.)/.test(f));
  const database = files.some((f) => /^packages\/database\//.test(f)
    || /^apps\/api\/src\/modules\/(rie|files|sfa-setup|companies)\//.test(f)
    || /^apps\/api\/src\/common\/prisma\//.test(f)
    || /\.(sql|prisma)$/.test(f)
    || /\.postgres\.spec\.ts$/.test(f));
  const ai = files.some((f) => /^apps\/api\/src\/modules\/(assistant|gpt|prospects|data-sources|data-source-platform|visit-copilot)\//.test(f));
  const erp = files.some((f) => /(?:sfa|warehouse|invoice|stock|ledger|collection|payment|operating-settings)/i.test(f) && /^(apps|packages)\//.test(f));
  const tooling = files.some((f) => /^tools\/quality\/|^\.github\/|^(package\.json|pnpm-lock\.yaml)/.test(f));
  const api = tooling || code.some((f) => /^apps\/api\/|^packages\//.test(f));
  const web = tooling || code.some((f) => /^apps\/web\/|^packages\/schemas\/|^packages\/config\//.test(f));
  return { database, ai, erp, api, web, tooling };
}

export function selectTests(files, specs, mode = 'changed', read = readFileSync) {
  const risk = classify(files);
  // SQL/data-access services also live outside the rie module. Inspect source,
  // and retain path classification for deleted files. This is not a SQL linter.
  risk.database ||= files.some((file) => {
    if (!/^apps\/api\/src\/.*\.ts$/.test(file) || file.endsWith('.spec.ts')) return false;
    try { return /\$queryRaw|\$executeRaw|PrismaService|RieFacade|ScalableQuery/.test(read(file, 'utf8')); }
    catch { return true; }
  }) || risk.tooling;
  const postgres = specs.filter((f) => isPostgresSpec(f, read));
  const offline = specs.filter((f) => !postgres.includes(f));
  if (mode === 'postgres') return { risk, tests: postgres, needsPostgres: true };
  if (mode === 'release') return { risk, tests: specs, needsPostgres: true };
  const selected = new Set(critical);
  if (mode !== 'critical') {
    // API/shared changes run all offline regressions, including parity mocks.
    if (risk.api || risk.ai || risk.erp) offline.forEach((f) => selected.add(f));
    else if (risk.web) offline.filter((f) => f.startsWith('apps/web/')).forEach((f) => selected.add(f));
    if (risk.database) postgres.forEach((f) => selected.add(f));
    for (const file of files) if (specs.includes(file)) selected.add(file);
  }
  return { risk, tests: [...selected].sort(), needsPostgres: [...selected].some((f) => postgres.includes(f)) };
}

export function isSuccessful(counts) {
  return counts.passed > 0 && counts.failed === 0 && counts.skipped === 0 && counts.todo === 0 && counts.cancelled === 0;
}
