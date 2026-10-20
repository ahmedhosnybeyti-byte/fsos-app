# Controlled SFA Production release — 2026-10-20

## Authorization and residual risk

The project owner explicitly authorized API, then Web deployment to Railway
Production, and only the two previously tested additive migrations. They
temporarily deferred independent password-vault/external-backup custody and
requested a protected preview before visual acceptance. No real customer
company activation or permission grants are authorized.

Residual recovery risk accepted for this release: the retained encrypted backup
key is protected by Windows DPAPI CurrentUser. Loss of this device/profile can
make the backup inaccessible. The successful ephemeral Linux portability test
does not provide durable key custody. Configure external custody separately.

## Release contents and verification

- Approved foundation: `781fc802f97a7f0601dd7611e753139cde1da8b3`.
- Preview addition: `7d59abb`, a Web-only local commit on that foundation.
  API, schema contracts, Prisma schema and migration files are unchanged.
- `/admin/sfa-preview` checks the HttpOnly access session with the existing API
  on every server render, requires current ACTIVE SUPER_ADMIN and no forced
  password change, and fails closed. Responses are dynamic and not cached.
- The preview reuses the actual setup screen and shared visual system, with
  fixed synthetic checklist/warehouses held in memory. No company/database is
  seeded, no tenant SFA requests run, and all mutation entry points are disabled
  or rejected in preview mode. Normal `/sfa/setup` authorization is unchanged.
- Focused preview authorization tests: 2 passed, including tenant roles,
  disabled/temporary-password accounts, missing sessions and API failure.
- Web TypeScript: passed. Updated Linux standalone build: passed.
  The prior 101 regression checks and 34 isolated API security checks were not
  repeated because backend/operational code has not changed.
- System Design Gate: PASS. One existing bounded account validation is the
  security boundary; synthetic preview requires no analytical queries or data
  writes and cannot broaden operational access.
- Release upload is assembled from Git commit contents only; uncommitted
  recovery tools, reports, temporary files, secrets and backups are excluded.
  No Git push is needed for the Railway CLI upload.

## Safety and rollout

Pre-release read-only baseline: 7 companies, 43 migration records, zero
`sfa.access` grants, zero enabled `sfa-setup` company screens. Company control
metadata is fingerprinted locally for comparison after deployment.

Only these migrations may run, once through the existing API pre-deploy hook:

1. `20261019090000_company_operating_settings`
2. `20261019120000_sfa_warehouses`

Stop on migration failure, unexpected migration, company control changes,
unexpected operational rows or unauthorized access. Do not repair migration
history automatically. Roll back application images if necessary; retain the
additive tables and never automatically restore Production or delete rows.

Rollback deployments recorded before release:

- API: `243c7e34-1a29-4552-aeb0-0b3971f6821b`
- Web: `8dcaf605-5292-461c-bd10-e6e388308b56`

## Execution result

API and Web are deployed successfully from the clean `7d59abb` artifact:

- API: `5c5ec417-743a-4662-a6ad-ff1e49554ec6`.
- Web: `b73932f5-f1ad-4c67-9966-d4f1d9a0f0bc`.
- Application: <https://www.murshidakapp.com>.
- Protected, read-only preview: <https://www.murshidakapp.com/admin/sfa-preview>.
- Artifact SHA-256: `0E10440E006D0E418FBB0BC2971AD7A3B87516C71BA5737D0FDEF6AAF7DC121E`.
- No Git push; the configured GitHub source branch was not changed. Future
  Git-triggered releases must include the deployed local changes.

A fresh backup was taken before deployment and fully restored to a new local
PostgreSQL 18.6 cluster. Restore/parity passed at 05:10:52 Arabia time, then
AES/HMAC encryption and full decrypt/checksum verification passed. Evidence is
in the excluded, ACL-restricted `.local-backups/20261020T015654Z/`. The archive
contains 114,786,296 plaintext bytes; 7 companies, 124 users and 43 original
migration records were restored. No Production backup writes were made.

The API pre-deploy hook applied exactly the two expected migrations. All 43
old ledger records, including a rolled-back attempt sharing a migration name,
were preserved; the ledger now has 45 records. New migration checksums match
the uploaded artifact. An initial name-only validation comparison stopped
rollout, then complete multiset comparison proved this was a validation-tool
assumption; no migration-history repair or extra SQL migration was performed.

Fourteen API smoke checks passed: readiness, valid platform session, anonymous
denial, no platform-admin tenant SFA bypass, default ANALYSIS_ONLY, tenant
ownership, denied cross-company access and forged company scope, existing
bounded file-registry and Smart Loading hierarchy reads. Visit Copilot's
representative registry retains its existing supervisor-only service boundary
(403 for the company administrator); a full analytical/AI workflow was not run.
There is only one eligible active Production tenant context; bidirectional
enabled-tenant SFA isolation remains covered by the prior 34 synthetic API
checks. No accounts were activated just to expand testing.

Initial post-deployment company-control fingerprints matched exactly. During
visual checks the owner manually enabled `sfa-setup` for the active company.
The administrative audit records SUPER_ADMIN `company.feature_access.update`
at 05:27:13 Arabia time, and the owner explicitly confirmed that action in chat.
Verification paused on the fingerprint change and resumed after identifying
it. The agent neither performed nor reverted that owner action. Current SFA
role grants remain zero; operating-settings rows and SFA-mode companies remain
zero; warehouse rows remain zero. Screen visibility alone deliberately does
not enable the company operating mode or grant operational access.

Both deployments are SUCCESS. Bounded samples of 31 HTTP entries per service
showed no 5xx or upstream errors, and sampled runtime logs had no error-level
entries. API readiness passed. Existing auto-converted legacy health-route
warnings were observed; no legacy-routing change was made.

Preview authorization is validated with actual current API sessions. Next.js
can stream HTTP 200 before a parent loading boundary resolves, so denial tests
check the streamed redirect/not-found instructions and actual guest browser
navigation rather than treating HTTP status alone as proof of authorization.
Test sessions are short-lived, held only in memory and closed in separate
browser contexts; no passwords, signing secrets or session cookies are saved.

Nine Web checks passed at 05:29:42 Arabia time: login page, guest redirect,
invalid/tenant session denial, authorized platform preview, real guest-browser
redirect, Light and Dark desktop/mobile rendering, and English LTR navigation.
Arabic mobile width/scroll width both equal 390px in both themes. Add/edit
buttons are disabled; no operational SFA/settings requests or page exceptions
occurred in preview. Actual screenshots are in the excluded local directory
`.tmp/controlled-release-20261020/screenshots/` (light/dark desktop/mobile).

The owner must still approve the appearance. Independent recovery custody is
still deferred by the owner's explicit release decision.
