# Sales price exceptions — Foundation 002-B2 / Part 1

Local scope, 2026-10-23; review base `f482d9bde14b94e3619e221d61a416b145874ca6`.
This continues Foundations 001, 002-A and B1 without changing their behavior.

## Design and data contract before implementation

One request concerns one saved draft's customer, current canonical sales channel
and one saved WMS product/unit. Wider/channel-wide exceptions are deferred. Client
input cannot select a company, rep, customer, channel, price-before or approval state.
Proposed special price/discount and desired dates are proposals, never effective prices.
No approved price exists to populate price-before; it remains explicitly unknown.

Workflow: SALES_REP + explicit request permission → SUBMITTED;
SUPERVISOR + review permission → REVIEWED (forward only);
MANAGER + approval permission → APPROVED or REJECTED.
All three actors must differ, including after role changes. Decisions are immutable;
a correction is a new request. Approval requires an explicit attestation that an
official external proof was reviewed under company policy, plus its type/reference.
A reference alone is not automatic proof validation. No email/WhatsApp is fetched/sent.

The approved queue is read-only for COMPANY_ADMIN with explicit accounting.read and
the new accounting-queue permission, reusing the current accounting role boundary
without granting anything. There is no dedicated accountant role in the current enum.
Sales managers cannot activate prices. No execution endpoint exists for any actor;
activation is REQUIRES_SETUP for everyone until approved price ownership/effectivity
and accounting execution authority are designed. No imported/cost prices are changed.

Private visit-photo storage is not a generic approval-attachment contract. This slice
stores bounded plain-text proof references and attestations only; attachments are
explicitly unavailable rather than misusing visit-photo permissions or arbitrary URLs.

Authorization: current database company mode, active user/role and explicit role
permissions; current RIE customer/hierarchy for creation/detail/decisions. Lists use
existing RIE hierarchy resolution and company/route/rep predicates before pagination;
accounting sees approved requests only. Changed customer channel/route blocks decisions
until a new correctly scoped request is made. No canonical or analytical formula change.

PostgreSQL owns typed requests, immutable stage events and idempotent actor command
results. One short transaction: fresh admission → command identity → locked request
and expected version → transition → event/command/audit → commit. No RIE or storage
call while holding the write transaction. SQL constraints/triggers defend immutable
proposal/identity, legal transitions, distinct actors and append-only history.

Reads: keyset list 20 + 1, scoped/indexed company/actor or route/status/time/id;
detail one request and at most three stage events. Product choice comes from at most
20 already-saved draft lines, no per-line query. No polling, caches, dependencies,
infrastructure, shared quality configuration, AGENTS or skill edits.

Only an additive Sales Invoicing migration is planned; no shared Prisma schema,
schema barrel, global dictionary or app-module edit is needed. Existing SalesDrafts
module and sales-draft contract/message exports provide the extension points.

## Verification and final acceptance

Implemented locally. The requested `.codex/skills/murshidak-system-design` path
does not exist; the actual `.agents/skills/murshidak-system-design/SKILL.md` was
read and applied. Final AGENTS and the central `SCALABILITY_GATE.md` were re-read.
The central contract was initially being written by its owning chat; no copy,
replacement skill, budget approval or general-quality configuration was created here.

### What exists now

- Additive typed PostgreSQL proposal/request, command and event tables. No table
  stores an effective price. Exact proposal values, desired dates, current channel,
  saved product/unit/conversion and customer identity cannot be edited after submit.
- A partial unique index prevents another open request for the same company/draft/
  product/kind, including re-key retries. Actor command identity + digest prevents
  changed-payload replays; expected versions and row locks serialize decisions.
- SQL guards enforce transitions/distinct actors and immutable history/identity.
  A deferred constraint requires the matching stage event before commit. Names and
  actor IDs are snapshotted in events. Existing AuditLog and command results commit
  in the same transaction; an audit failure rolls back the complete action.
- New permissions are catalogue entries only; no company mode or role grant is
  applied. Service checks fresh DB mode/user/role/permissions in addition to HTTP
  guards; no SUPER_ADMIN bypass. Client scope/state/financial fields are rejected.
- Rep request form extends the existing saved-draft editor. A separate localized
  queue/detail screen supports scoped review, immutable proof references, explicit
  evidence attestation and commercial decisions. Review/decision inputs are separate
  from the immutable proposal. Accounting has an approved-only read queue and no
  decision, activation, invoice or payment button. All activation values remain
  REQUIRES_SETUP, including after approval. The previous approved price is unknown.
- Keyset paging returns at most 20 requests and a cursor; detail returns at most
  three events. Lists do not accumulate pages. No query polling/reconnect refresh
  can replace a pending decision form. Commands retain the same key for identical
  retries. Draft reconnect/focus behavior and B1's check contract are unchanged.

### Actual tests and evidence

`pnpm quality --base f482d9bde14b94e3619e221d61a416b145874ca6` and
`pnpm quality:postgres` run using the installed manager with
`npm_config_manage_package_manager_versions=false` (no installation).
The final full B2 gate passed **649 checks / 145 suites**, all four typechecks;
independent SQL passed **177 checks / 30 suites**. Zero failures/skips/TODOs/
cancellations. Final acceptance files are retained under the B2 evidence folder.

- Isolated SQL: strict identity/amount/date/evidence validation; duplicate/re-key
  protection; skipped/wrong stages; company/hierarchy denial; Analysis Only and
  inactive actors; fresh permission revocation; self-review/approval after role
  changes; exact proposal/snapshot preservation; terminal rejection/approval;
  audit rollback; immutable DB history and keyset paging without repeated IDs.
  Supervisor terminal rejection is denied by API, SQL transition guards and UI;
  only the manager can approve or reject after supervisor review.
  Existing Foundation 001/002-A/B1 regressions remain selected by the normal gate.
- Native PostgreSQL/actual Nest/auth/RIE/Prisma HTTP:
  `node tools/quality/sales-price-exceptions-native.cjs`. It validates the existing
  test cluster directory `.quality/wms/pgdata`, loopback 55561 and a synthetic source
  name, dumps/clones that source, applies only the new migration to its clone,
  and grants permissions only to synthetic test users. The normal operating DB,
  `.env`, Docker, Production and Railway are never used. Four local test-pool
  connections support two concurrently issued command requests; this is not a
  150-user workload or native lock-wait measurement.
- Identical concurrent review commands return identical recorded results. Conflicting
  manager commands yield one committed transition and one 409. A real synthetic
  `audit_logs` trigger failure returns the expected 500 and leaves request, event
  and command counts unchanged. These deliberate negative responses are classified
  separately from normal measurements. The trigger is removed after the test.
- Protected before/after digests cover 16 WMS/custody/allocation/policy/accounting/
  canonical/version/file tables, including nonzero balances. All match after the
  HTTP workflow and negative cases. B1 still reports pricing setup required and
  insufficient own custody independently of warehouse coverage. PGlite also proves
  the original saved draft and reference data are unchanged.
- Actual browser: one uniquely identified synthetic request was submitted by rep,
  forwarded by a different supervisor, approved with formal-reference attestation
  by a third manager, and viewed in the accounting queue. Version advanced 0→1→2;
  proposal remained 11.250000 SAR per saved CARTON. No price-edit/execution control
  appeared. A missing date rendered validation rather than submitting. There were
  20 result/form-present checks: Arabic/English × light/dark × 1440/767/480/430/390;
  no horizontal overflow. Those layout checks preceded the final supervisor-only-
  forward correction; the four-role workflow was repeated afterwards, explicitly
  verifying zero supervisor reject buttons, both manager decisions, and zero
  accounting decision buttons. Screenshots and browser JSON are retained. Source/render
  regression tests cover denied queues and stage-specific controls. No new offline
  emulation, proof-file upload or real email/WhatsApp verification was performed.
  A separate read-only verification of the retained browser database confirmed all
  three actor IDs, persisted APPROVED/version 2/value 11.250000, and the same 16
  protected digests after browser approval as before it.

Evidence: `.quality/sales-price-exceptions/{native.json,scalability.json,scalability-assessment.json,browser.json,browser-final-verification.json,
changed.json,postgres.json,screenshots/}`, final logs and the focused B2 SQL/UI
tests. Runtime-private files are ignored and are not included in the report.

### Performance, scope and remaining risk

The final passing measurement used 25 observations per operation after three
warmups, actual normal concurrency **1**, two customers, three products, one saved
draft line, and request growth **1→228** (28 full approval chains plus 200 rejected
synthetic history requests). The growth fixture's request/event/current-customer
statistics were explicitly prepared; this does not resolve B1's stale-statistics risk.
Total fixture rows (all public tables except migration metadata) were 405 at the
one-request sample, 675 after the 28 approval chains and 1,475 after growth seeding.
Write measurements grow through 1→28 requests and have unknown planner statistics;
they are observations, not a fixed-cardinality approved write baseline. The final
source fingerprint remained unchanged during measurement. The final synthetic
measurement clone is retained for the refreshed browser verification and review.
Other local acceptance suites ran alongside this final measurement; these are
observations under shared-machine activity, not a controlled latency baseline.

| Operation | API p95 ms (final passing run) | Actual SQL statements/request |
| --- | ---: | ---: |
| Submit proposal | 241.2 | 26 |
| Supervisor review | 215.9 | 27 |
| Manager approve | 235.0 | 27 |
| List with 1 request | 171.4 | 12 |
| List with 228 requests | 131.6 | 12 |
| Read request | 84.2 | 12 |
| Accounting queue | 65.7 | 10 |

Counts include real auth/admission/BEGIN/COMMIT and all engine statements, excluding
internal PL/pgSQL execution. In an earlier instrumented run, one extra engine
`SELECT 1` liveness probe made a total 27→28. It remains in the raw total; only
identified health probes are separated for structural count assertions. No budget
was increased. Feature statements remain 7 for create, 9 for review/approve and
2 for reads; list 1 versus list 20 has the same count, not one SQL call per item.
The first native harness assertion failure and subsequent cause are documented here;
they were measurement assumptions, not a raised performance acceptance threshold.

Native tiny-fixture plans returned 21 lookahead list rows, one detail and three
events. Detail used `sales_price_requests_company_id_id_key` and the event key;
lists selected a single sequential request scan on the tiny 229-row post-race
fixture (2.060 ms rep list; 0.650 ms accounting list; detail 0.590 ms). Available
indexes are company/requester/time/id, company/route/time/id, company/status/time/id
and the partial unique open-request key. Index availability is not a claim of
list index usage at scale. Scoped current-customer metadata is resolved in PG,
once in these plans, without materializing JSON entities in Node. Maximum list
payload was about 14.8 KB. Full test-process RSS was about 271 MiB, including Nest/
TypeScript/fixture tooling; incremental feature memory is not measured.

The final harness also emits the central gate's closed JSON format, using a
maintained-source fingerprint and actual fixture row counts. Native server timings
remain in raw read-only plans; missing per-request server/lock/pool/transaction/RIE
timings are null, not manufactured zero. Stock/custody contention are not applicable
to this request-only path: it never writes those resources and exact digest parity
is checked. Mixed analytics/ingestion contention remains untested/null.
No causal latency bottleneck is established by these shared-machine observations.
The measurable growth risk is scoped list scanning before pagination; larger/skewed
fixtures and native wait attribution are required before drawing a capacity conclusion.
`pnpm quality:scalability --evidence .quality/sales-price-exceptions/scalability.json
--baseline .quality/sales-price-exceptions/no-approved-baseline.json` returned
**WARN / UNVERIFIED**, with zero failures and explicit missing-baseline/measurement
warnings. No baseline or budget approval file was created, and the central gate
did not certify capacity. The first passing raw run is retained separately as
`native-first-pass.json`; its earlier rejection protocol differs from the final
manager-only rejection protocol, and it is not a comparable approved baseline.

**System Design Gate: WARN** — local functional/security/transaction gates pass;
price activation, approved proof retention and execution authority remain blocked.
**Scalability Gate: WARN (UNVERIFIED)** — scoped serial/growth observations exist,
but no approved baseline/budget, representative multi-customer skew, native lock/
pool wait distribution or mixed RIE load/capacity evidence exists. No 150-user,
release, Node 22 or Linux packaging claim. No full release gate or Docker build.

### Shared-file coordination and remaining blockers

1. No edits to AGENTS, skills, root app-module/schema barrels/dictionary registry,
   general quality policy/runner, scalability budgets, or Scalability Lab. Other
   chats' changes remain untouched. Existing scoped module/contract/message exports
   provide the extension points. The new migration is uniquely named and touches
   only Sales Invoicing tables/functions/permission catalogue.
2. The shared Prisma schema was deliberately not edited. These new tables are
   accessed through typed raw SQL. Registering their Prisma schema mirrors before
   future automatic migration generation requires a coordinated shared-file edit;
   otherwise a generated schema diff could propose removing unmanaged tables.
   No operating migration or deployment is authorized by this local implementation.
3. Shared sidebar integration was not edited. Rep can follow the link in the draft;
   authorized supervisor/manager/accounting can use `/dashboard/sales-price-exceptions`.
   Adding a shared navigation entry requires coordination with its owner.
4. Before price activation: approved versioned channel-price source/ownership;
   customer override/discount conflict precedence; accepted product/UOM/currency/
   rounding/tax contract; exact effectivity/date/timezone and changes/revocations;
   trusted official-proof retention/verification policy and a separately authorized
   accounting executor identity. Approval alone never satisfies those prerequisites.
5. Attachments remain unavailable. Existing private visit photographs do not confer
   permission to store/read commercial approvals. Adopt a purpose-bound private
   proof contract before adding uploads; do not accept arbitrary public URLs.

Safe next part: coordinate schema/navigation mirrors and approve the channel-price,
proof/effectivity and accounting authority contracts, then implement a separately
authorized inert price registry/lookup with parity tests. Do not enable price changes
from rep/supervisor/manager forms and do not begin invoice posting. All proposed
future dates remain nonbinding until that contract exists.

Credit can reuse the distinct-stage command/event pattern later, but not this price
payload or authority. Approved customer/account identity, limit/effectivity/exposure
policy and accounting execution authority remain prerequisites. No credit mutation,
invoice posting, stock/custody deduction, GL/AR, cash collection, tax/print or ZATCA.

## Changed files in this part

- `packages/database/prisma/migrations/20261023001000_sales_price_exceptions/migration.sql`
- `packages/schemas/src/sales-draft.schemas.ts` (additive B2 contracts)
- `apps/api/src/modules/sales-drafts/sales-drafts.module.ts` (local registration)
- `apps/api/src/modules/sales-drafts/sales-price-exceptions.{controller,service}.ts`
- `apps/api/src/modules/sales-drafts/sales-price-exceptions.postgres.spec.ts`
- `apps/web/src/components/visit-execution/sales-drafts-panel.tsx` (request form)
- `apps/web/src/components/visit-execution/sales-price-exceptions-panel.tsx`
- `apps/web/src/components/visit-execution/sales-price-exceptions.spec.ts`
- `apps/web/src/lib/api/sales-price-exceptions.ts`
- `apps/web/src/lib/i18n/sales-draft-messages.ts` (Arabic/English keys)
- `apps/web/src/app/(dashboard)/dashboard/sales-price-exceptions/page.tsx`
- `tools/quality/sales-price-exceptions-native.cjs`
- This report. No commit, push or deployment.
