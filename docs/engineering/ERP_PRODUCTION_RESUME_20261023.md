# Existing ERP Production release — 23 October 2026

## Current outcome

Owner payment condition (2026-10-23): cannot pay now; authorizes proceeding only if payment is after Monday, 2026-10-26. No upgrade/resize has been applied. Official Railway policy allows partial charges before cycle end, so absence of an immediate charge is not established. Preserve this condition on any continuation; the first date clearly after Monday is Tuesday, 2026-10-27 (Asia/Riyadh). No paid action is scheduled automatically.

Screens deployed; historical publication is **BLOCKED by PostgreSQL disk capacity**. Do not retry approval, delete data, create a new company/environment/volume, or enable financial posting to work around this condition.

The existing 5,000 MB PostgreSQL volume is 96% used (Railway sample: 4.803854336 GB). Production approval failed with SQLSTATE 53100, "No space left on device", while extending rie_entity_rows. Verified atomic rollback: project remains STAGING at revision 2, zero ERP published versions/products, zero live stock movements/journals/vouchers. No partial historical publication.

The current Hobby plan allows up to 5 GB storage. The live Railway Plans page offers Pro at $20 minimum monthly usage, including $20 usage credit and extra resource charges after that credit. Proposed remedy: upgrade the existing workspace plan and grow the same PostgreSQL volume to 10 GB; no new hosting resources or data migration. This financial commitment is awaiting explicit owner approval. No upgrade or resize was applied.

## Actually deployed

- Existing Railway project, Production environment and API/web/PostgreSQL services reused.
- API deployment 4448e9b9-45df-4740-9493-bc97262bef6f at e398a694f381a06aa805863160dc9c4fb1875d17: WMS, visit/photo, inert sales drafts and price-exception endpoints.
- Web deployment 7738fe58-fb88-41a4-98e9-744add893c8a at ed8038bce26335c11d93a23e64f175148b967083: prepared screens and tested upload gateway corrections.
- Fixed production API emission root/test-fixture inclusion, Next 15 promised searchParams, finite 300-second rewrite timeout and 65 MB cloned-body limit. API file cap remains 64 MB.
- Exact 12 additive migrations applied via existing serialized API pre-deploy, after successful restored-clone test. Ledger: 58 completed migrations.
- ERP company cmvhd2ok8000mp701th4yt6xr and manager cmvhd2oo4000yp701zont6ntf retained; FULL_ERP already set.
- Owner explicitly approved the shared COMPANY_ADMIN role effect on 18 holders. Narrower 19 permissions added for SFA access, warehouse read/receiving/loading/returns and accounting read/price review. Existing grants retained; no access delegation, opening stock, product/policy/quality administration or financial-posting grants added. Only ERP warehouse feature enabled; zero other operational-mode tenants verified.
- Existing manager opens warehouse and price-exception screens. No warehouse, stock, rep account, company, environment or service was fabricated.

## Actually ingested

Original source: D:\Murshidak-Import\FSOS_Canonical_ERP_Demo_OneCompany.xlsx.
52,653,331 bytes; SHA-256 407e3683fcf1e44183c1d674b5e465d6f8bedb7876fe2c95e4138738315c3484.

One original upload, one worker attempt, 500-row staging transactions:
686,684 source rows; 21 identical repetitions; **686,663 unique staged rows**; **0 errors**, no pending dependencies at review. Includes 1,600 customers, 100 products, 44 employees and 16 routes, plus the approved historical facts.

Import project: 5d7218f4-2917-40b6-9d9b-e385a948d9bf.
Upload: 96c283d9-405b-4e37-b2b0-3124245966c9.
Worker finished at 2026-10-23T05:13:17Z.
Approval attempt at 05:20:52Z rolled back after disk exhaustion.

History is retained in validated staging, **not yet published to manager analytical screens**. Employee registry synchronization is pending approval; no new login accounts were provisioned. Reuse the same revision/dataset after storage recovery; do not reupload.

## Recovery, controls and testing

Fresh complete encrypted backup: .local-backups/20261023T041002Z.
Authenticated decrypt and isolated restore passed (8 companies, 125 users); owner/SYSTEM ACLs, DPAPI CurrentUser key custody. Off-device key escrow is not established. Tested all 12 additive migrations on a new restored clone before Production.

Current control comparison PASS: user identity/password/role/session fields, subscriptions and other company settings unchanged. Approval rollback and no live posting verified by scoped SQL. Largest tables: erp_import_rows 1,978,630,144 bytes, rie_entity_rows 780,075,008, rie_canonical_entity_rows 622,321,664. Current database logical size: 3,528,341,183 bytes, excluding other filesystem uses such as WAL.

Focused checks only: production API compile/entrypoint, web typecheck and actual Linux builds, readiness 200, anonymous protected routes 401, existing-manager warehouse/price access, actual Next byte-clone reproduction and full approved-file SHA parity. Prior native full-import and operational regressions reused; broad suites were not rerun. Actual Production disk failure is BLOCK, regardless of prior passing tests.

No incomplete financial posting, actual collection or tax-invoice issuance enabled. Live rep visit/photo/draft roundtrip remains unverified because ERP has no rep account/assigned operating route; no impersonation added.

Rollback preserves additive schema and validated staging, rotated DB credentials and current company mode. No down SQL, automatic restore, history deletion or volume wipe.

Owner accepted unresolved Railway incident-token revocation risk; exposed token was not used. Independent existing connector/browser/Git authorization used.

## Gates and next action

System Design Gate: BLOCK — current storage cannot complete atomic history publication.

Scalability Gate: BLOCK — actual 686,663-row import at worker concurrency 1 exhausted the existing disk during publication. API sampled memory maximum about 0.619 GB; no worker/RIE concurrency increase. Import total SQL count, API p95, mixed-load and 150-user capacity are unmeasured; no capacity PASS claimed.

After approved expansion: verify disk headroom and readiness, approve the existing revision once, reconcile all entity counts/relationships and current-date publication, verify products and unchanged controls/no live postings, then use the existing employee-registry sync and verify manager visibility.

Evidence: .quality/erp-production-20261023/storage-blocker.json, backup/migration/activation reports, upload-body-check.json, import-resource-samples.json and railway-storage-upgrade.png.

