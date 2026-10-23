# Company Operating Modes — controlled Production release, 2026-10-21

The owner explicitly authorized the exact company-only release and its single enum addition, conditional on a fresh encrypted backup and isolated recovery before any change. No new Demo, tenant activation, WMS, accounting or invoice operation is authorized.

## Source and isolation

- Deployed candidate: `41f06ee7b29cb797a55adcd8501eaaaee3c7490d`, local branch `codex/company-modes-production-20261021`.
- Base: previously deployed `7d59abb`; includes its hotfixes. Backports company work from `624321d`, excludes later WMS commits and migrations and new Demo scripts.
- Exact Git archive: SHA-256 `5996f178efac0a79ba9479c73691a042ec4639350574d404a7b86866e92b91ab`, 816 tracked files, no untracked/WIP/backups/secrets. Archive files were verified during extraction and its file set matched the commit. Source was uploaded with an explicit project/environment/service and archive identity in the deployment message. Railway CLI-upload metadata does not expose a commit hash; this recorded artifact/upload chain is the provenance evidence.
- No Git push or deployment-source configuration change. Root branch and concurrent WMS edits were preserved. Docker Desktop was not started or repaired; existing Dockerfiles/build/startup configuration is unchanged.

## Recovery before change

Fresh read-only Production logical backup: `.local-backups/20261020T234956Z/`, excluded from Git and builds, ACL restricted. Plain archive: 114,792,505 bytes, SHA-256 `1A07BCA572F303F70B53D0A2342C7C281B06430DF141A75F3B90E5DE446C22F4`.

First full restore on a new loopback-only PostgreSQL 18.6 cluster passed at 02:57 Arabia time. AES-256-CBC/HMAC-SHA256 encryption and complete authenticated decrypt/checksum verification passed. The encrypted archive was then decrypted and **fully restored again** into a second new loopback-only cluster; schema/migration parity and counts passed at 02:59 Arabia time: 7 companies, 124 users, 45 original ledger records. Both recovery servers were stopped; recovered dump plaintext was removed. Encrypted archive SHA-256: `B721B5DC88DDB2D5B145A8509CDDFF8982C418A8EF645EC5B86CCCFF7F172B3F`.

Key protection is Windows DPAPI CurrentUser. Recovery was demonstrated on this device/profile; independent off-device key custody has not been verified. Logical backup intentionally excludes cluster ownership/ACL restoration. Evidence: `evidence.json`, `production.dump.encryption.json`, `encrypted-restore-evidence.json` in the protected backup directory. Recovery used authorized backup data, never Production as a test database.

The second recovery helper initially failed before server startup because a cleared PGPORT propagated as an empty value. Setting its explicit isolated port fixed the helper; the subsequent full recovery passed. No application or Production setting was changed to resolve this.

## Migration and protection

Preflight compared all successful deployed migrations with the candidate; existing SQL matches the deployed base exactly. Four historical checksums use CRLF, while the Git artifact uses LF; the ledger matches those line-ending variants. No history repair or old migration edit was made. The only pending migration was:

```sql
ALTER TYPE "CompanyOperatingMode" ADD VALUE 'FULL_ERP';
```

The existing serialized API pre-deploy hook applied exactly `20261020130000_company_full_erp_mode`; no separate manual migration command ran. Post-migration multiset/checksum verification preserved all 45 old ledger records and found exactly one approved completed addition. All seven companies' mode/settings, feature/status controls, user role/status/session-version controls, subscriptions and SFA grants matched their fresh before-release fingerprints. Operating-settings rows and SFA role grants remain zero; no tenant was put in FULL_ERP. No WMS tables or new Demo were created.

Rollback retains the additive enum and data. Old API rollback requires verifying no FULL_ERP settings exist; once any exist, retain a compatible API or use a reviewed compatible fix. Never automatically downgrade tenants, delete data, remove enum values or restore an old database.

## Verification and rollout

Local quality against release base `7d59abb`: 494 tests plus four typechecks PASS. Full release gate: 494 tests plus four typechecks PASS. Isolated SQL: 79 PASS, no skips/TODOs/failures. Native PostgreSQL 18.6 synthetic Egypt/Saudi migration compatibility passed. API/Web local production build passed with a local verified Windows directory-junction helper; source/deployment configuration was unchanged.

API deployment `54567f71-e1c5-4d81-80bd-8d017733662b`: Linux image build PASS, deployed SUCCESS, readiness PASS. Image digest `sha256:3e40c9d2a9279a7cb5f4cd2b0962207639a2de7d170a9808b1f7d3ddfca62c56`. Thirteen actual API checks passed: readiness, platform identity, bounded companies/settings/files reads, anonymous and tenant denial, cross-company denial, preserved SFA admission and invalid-body rejection before writes. Tenant fingerprints remained unchanged. Short-lived existing-user identity sessions were held only in memory; no password login or successful Production company creation/update was performed.

Web deployment `3ec8a484-2303-4f5a-8cea-0e607c962c35`: Linux image build PASS, deployed SUCCESS, online 1/1. Image digest `sha256:0fc6ecdb19f55457cd574711c1d727381dafd7fe53cf2c7779848074a54002ce`. API is also online 1/1; no pending Railway operations. Final verification completed at 03:08:55 Arabia time.

The final Web run passed 18 actual checks (the 13 API checks repeated, guest redirect to login, and four theme/locale browser journeys). Each journey opened Create Company, selected all three modes, verified separate Initial Plan, opened Edit Company, selected FULL_ERP in client state and verified the deferred-module labels and save control without saving. Mobile Create dialog bounds were inside the 390px viewport after animations settled; Arabic RTL/English LTR and Light/Dark passed. No browser exception or API mutation request occurred in those UI journeys. Initial screenshots captured transition frames; the final run explicitly waited for finite animations and verified dialog geometry before capturing replacement screenshots. The stable Arabic Light and English Dark screenshots were visually inspected.

Bounded log review: 35 API HTTP entries and a Web window of 371 HTTP entries contained no 5xx; sampled runtime entries had no error-level messages. The Web window contained one HTTP 499 for a public-registration settings request canceled by the browser during navigation, with the explicit message that the client closed before response. API retains its prior auto-converted legacy health-route warning. PostgreSQL remains online with one pre-existing Railway warning whose detail was not resolved in this task; no claim of a warning-free database is made.

Scope delivered: Super Admin Create Company and Edit/settings operating modes, separate Initial Plan, module availability/deferred status, existing server-side permissions and admission. Operational invoices are not implemented in this release; existing analytical invoice drilldowns remain as deployed. No new warehouse or accounting implementation is included.

Evidence is retained in `.quality/company-release-20261021/`: artifact manifest, deployment IDs, migration preflight, post-migration preservation, local gate logs/results, API/Web smoke results, sanitized log summary and mobile screenshots. System Design Gate: **PASS** for this narrow release. Design System Gate: **PASS** for the checked Create/Edit controls, theme/locale behavior and settled mobile Create layout. Successful company provisioning and audit-failure rollback were tested in isolated suites, not by adding a persistent Production test tenant. Password login was not repeated; the live login redirect and valid current identity/session path were checked. No operational invoice UI is claimed complete.

The authorized release is complete. Open <https://www.murshidakapp.com/admin/companies> with Super Admin access. All seven tenant control fingerprints remain unchanged; no additional migration or Production activation is pending within this scope. Independent off-device backup/key custody remains an explicit recovery limitation, not a newly completed check.
