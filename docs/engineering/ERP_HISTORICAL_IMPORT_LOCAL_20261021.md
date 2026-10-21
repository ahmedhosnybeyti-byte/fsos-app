# ERP historical import — local handoff (2026-10-21)

Scope: local implementation and isolated synthetic data only. No Production access, push, deployment, customer mutation or Google Sheets writes.

## Implementation

- Super Admin screen: `/admin/erp-import`; separate from the unchanged Analysis uploader. Company-scoped APIs enforce Super Admin authority again in the service.
- Reused Canonical contracts, existing storage, transactional audit, RIE version publication/query admission and WMS product/stock commands. No new dependency.
- Durable staging preserves valid rows, reports invalid/pending references, accepts corrective batches and requires revision-checked approval. SHA-256 upload uniqueness plus company/project/entity/business-key constraints prevent duplication. Conflicting identities require review.
- Existing Analysis history is copied within PostgreSQL, without republishing that baseline. Approval rejects a changed source snapshot. Missing master metadata requires correction before approval.
- Product code, original Arabic name and packing fields remain intact. WMS uses the same product identity with an explicit carton-to-piece conversion; original packing remains in `erp_product_links.source_uom`.
- Historical invoices, collections, returns and van inventory never post operational balances. Import does not activate company modes, permissions, subscriptions or operational modules.
- Synthetic reference: **2026-12-31**; proposed operational cutover: **2027-01-01**, still unapproved. Future history remains available through explicit demo-as-of RIE preview and is excluded from ordinary published analytics.

## Evidence

Approved source: `D:\Murshidak-Import\FSOS_Canonical_ERP_Demo_OneCompany.xlsx`.
SHA-256: `407e3683fcf1e44183c1d674b5e465d6f8bedb7876fe2c95e4138738315c3484`.

- Source contains 686,684 rows, one CO-01, 100 products, 1,600 customers, four regions and sixteen routes. Actual PostgreSQL reconciliation found **21 identical repeated invoice lines**, retained once: **686,663 unique rows**, including 382,501 invoice lines. The earlier read-only audit's zero-duplicate summary is superseded by this row-level reconciliation; no row was discarded because of a conflicting value.
- Focused isolated SQL regressions: **3 passed, 0 failed/skipped**. Includes corrective batches, unchanged names/UOM, duplicate upload, tenant authorization, atomic audit rollback, existing-history reuse/staleness, future-date isolation and separate new WMS opening.
- API and Web TypeScript checks: **PASS**. Prisma validation: **PASS**.
- Full import result and persistent local database: `.quality/erp-import/native-results.json` and `native-runtime.json`; staging reconciliation: `native-staging.json`. The native runner verifies the exact loopback test cluster before creating a fresh database. It never loads application credentials.
- Full PostgreSQL evidence: **PASS**, database `erp_history_320dbe9beed548f4928fbf66e77c7991`, completed `2026-10-21T10:51:13Z`. All 686,663 unique rows accepted and approved; all 100 products match source names/codes/UOM, RIE reads them, same-file retry queues nothing, future invoices stay outside ordinary analytics, and an independent WMS opening posts exactly 24 pieces once.
- Broad release, UI visual and performance suites were intentionally deferred under the user's latest instruction; no Production readiness claim.
- A slow correlated JSON containment check was replaced with a scoped PostgreSQL scalar-equality anti-join. Validation resumed on existing staging; the full workbook was not reimported. Same-batch identical rows are included in duplicate counts.

System Design Gate: **PASS for the tested local import scope**. UI Design Gate: **WARN**, visual/browser acceptance deferred. Release approval: **BLOCK / not requested**; broad release/build and migration/deployment review remain separate. No failed check is waived by these local results.

## Remaining operational and release work

Independent approved openings are still required for warehouse lot/location stock, sales-rep custody, customer receivables, supplier payables and balanced GL. Van stock is not a warehouse opening. Historical approval is not operational cutover.

New additive migration: `20261021130000_erp_historical_import` creates five onboarding tables and indexes; it depends on the existing WMS schema. Before a Railway release, independently compare Production migration history and the safe release branch: WMS dependencies may also be unpublished. Do not run pending migrations automatically. Obtain separate migration/deployment approval after an encrypted backup/isolated restore, compatibility review and release checks. Retain current Railway build/start/migration configuration.

Rollback plan: revert application release while retaining additive tables and imported evidence. Never drop history or undo stock by deleting rows. Any reversal of an approved publication requires a separate scoped review and backup. No rollback SQL or Production change was executed here.
