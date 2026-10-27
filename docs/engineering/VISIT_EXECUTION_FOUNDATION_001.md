# Visit Execution — Foundation 001 (local, 2026-10-22)

Review base: `f482d9bde14b94e3619e221d61a416b145874ca6`. Changes are local and uncommitted. No push, deployment, Production/customer database access, financial posting or application dependency change was performed. The subsequently authorized native MinIO setup is detailed in the closure section below. Pre-existing working-tree changes were preserved.

**Latest status: Foundation 001 local functional acceptance CLOSED. Real image upload, database linkage, browser reopen/read, private-store/actor isolation and storage-outage save/completion passed without Docker. System Design Gate: PASS for this isolated local scope; no Production/release approval. Earlier BLOCKED/WARN entries below are historical and superseded by the final native-image closure section.**

Subsequent direct-camera enhancement: implemented alongside file upload; its separate hardware acceptance remains WARN/pending, as recorded below. The prior real-image storage result is unchanged.

## Delivered slice

- Visit Copilot customer details expose **Start visit** only for the signed-in SALES_REP with `sfa.access` + `visits.execute` and server-confirmed SFA/FULL_ERP activation. Management analytical rep selection cannot impersonate a rep.
- The independent `/dashboard/visit-execution/[id]` screen loads a persisted operational visit with customer/rep name snapshots, entry source, timestamps, goal, notes, outcome and optional failure reason/explanation.
- Start request identities and a case-insensitive partial unique index prevent repeated open visits for one company/rep/customer. Retrying a start that resumed another open visit still resolves to that same visit after completion. A fresh key after completion intentionally starts a new visit.
- Save/finish use a locked row, expected version and hashed command identity. Immediate command replay returns the saved result; a changed payload/key with a stale version conflicts. Completed visits cannot be edited. Outcome is explicit; no invoice-existence rule determines success.
- Every start/save/finish/photo attachment includes durable audit in the same PostgreSQL transaction. No notes or image bytes enter audit metadata.
- Grouped collection/invoice/return summary, expandable purchased/stopped products, opportunities, the rep's last 10 operational visit notes and notes from the latest 10 scoped imported visits in the analysis period. Reuses existing Copilot analytical definitions without rebuilding analytics or changing Excel/RIE inputs.
- Shelf/cooler/planogram capture or file selection for all rep/customer business types. Uses the existing injected private S3-compatible `StorageProvider`, with a visit-specific API instead of granting access to the admin Excel ingestion endpoint.
- Server byte-signature validation for JPEG/PNG/WebP, 8 MiB per image, 30 images per visit, retry identity + content digest, tenant/visit foreign key and short (60 second) signed download URLs. The customer link is the photo's mandatory visit relation. Names/object keys are server-generated. Read/sign/attach recheck customer route access.
- Storage errors never mark a photo saved. Failed DB/audit writes attempt object compensation. A lost commit acknowledgement rechecks the stored object reference before cleanup, preserving committed evidence. If cleanup cannot be verified, the object is retained and an internal reconciliation error is logged.
- Arabic/English TranslationProvider dictionaries, RTL/LTR-aware dropdowns, shared cards/buttons/inputs/tokens, responsive grids, loading/error/empty/completed states. Operational save remains available when analytical context fails.

## Data/query contract and semantics

PostgreSQL is the operational source of truth; no operational write touches canonical Excel facts. `Customers.CustomerCode` is a stable business reference rather than a foreign key to a replaceable ingestion row. Current canonical hierarchy access is rechecked on reads and commands; losing the customer's route revokes access to historical visit/photo evidence for that rep.

The existing bounded customer briefing remains the analytical owner. Only its needed prepared fields are returned to the new screen. Its default three-month `from/to` range is shown explicitly. Supplementary RIE requests apply company, current state, requesting user's hierarchy, customer, period and status before returning:

| Read | PostgreSQL result bound |
| --- | --- |
| Authorize customer | 1 row, CustomerCode + CustomerName |
| Last confirmed invoice in period | 1 row, InvoiceNo/InvoiceDate/TotalAfterVAT; date then number descending |
| Last collected/cleared payment in period | 1 row, CollectionDate/Amount; date then collection number descending |
| Return Items through scoped confirmed/approved Returns | 8 ProductCode × ReturnReason groups, ordered by summed Amount |
| Own prior operational notes | 10 rows, indexed company/rep/customer history |
| Imported Visits notes | Notes from latest 10 customer/date/hierarchy-scoped visits; date then VisitID descending |
| Attached image metadata | 30 rows, indexed company/visit; signed URL fetched only on demand |

The context uses one request plan spanning the existing Copilot briefing and four supplemental reads, with Copilot's existing 24-PostgreSQL-execution ceiling and at most two concurrent logical operations. The final native HTTP fixture executes 10 RIE PostgreSQL calls including metadata and hierarchy; the request coordinator still serializes PostgreSQL calls. The original four-call inner plan was incorrect and is superseded by the final verification below. No polling, raw fact pagination accumulation, Node fact join or full-entity read was added. Node formats only bounded results. Existing Copilot product/lost-product aggregate contracts remain unchanged. Tiny synthetic SQL timings validate execution, not production capacity or scanned-row capacity. The native open-visit lookup used `visit_executions_one_open`, returned one row from one indexed match in 0.171 ms on the final tiny fixture; this is not a capacity claim. Representative analytical plans/load/RAM measurements were not performed.

- **Balance:** unavailable. Pending collection instruments are not an authoritative receivables balance.
- **Collection visit success rate:** unavailable. Required denominator = visits whose goal is collection; numerator = those linked to an actual trade collection. Canonical Collections has no visit link and imported Visits does not establish that goal. Neither same-day coincidence nor an ACHIEVED outcome substitutes for an actual collection.
- **Last invoice:** confirmed header amount including VAT, within the displayed period.
- **Average invoice:** existing Copilot sales-line value divided by its invoice count, with that denominator displayed; does not silently switch to the VAT-inclusive header formula.
- **Return rate:** existing Copilot return value / sales value × 100, with period and denominator displayed. Missing data/undefined denominators render as unavailable.
- **Stopped products:** Copilot's last-30-days versus historical-baseline analytical definition, explicitly distinct from a warehouse product status.
- **Previous notes:** separate, clearly labelled own operational notes and imported notes visible through current RIE hierarchy, within the displayed period. Empty notes in the ten selected imported visits are omitted; the UI does not claim these are the latest ten nonempty notes across all history. Imported note display is capped to 4,000 characters per note.

## Intentionally deferred / activation boundary

Invoice, return, trade collection and sales-order entries are visible, disabled and labelled as deferred integrations. The current capability registry marks those independent posting paths as deferred; no placeholder financial screen or fake financial write was created.

The schema and shared source enum include NEW_CUSTOMER / DISCOVERY / OPPORTUNITY_RADAR plus source reference for future entry adapters. The server currently rejects those adapters rather than trusting unverified references. Only VISIT_COPILOT is implemented in this foundation.

The additive migration is `packages/database/prisma/migrations/20261022120000_visit_execution/migration.sql`: `visit_executions`, `visit_execution_starts`, `visit_execution_photos` and the ungranted permission catalogue entry `visits.execute`. No role grants or company activation were changed. The SQL was executed only inside isolated synthetic test databases. An actual development app session needs this reviewed migration applied to an explicitly verified disposable/development target, explicit existing permission administration, an enabled company, a route-linked rep/customer and working existing S3/MinIO configuration. Do not run a blanket migration against an unknown `.env` target.

**Verified local storage blocker:** the configured endpoint is `localhost:9000`; its TCP connection check returned `ECONNREFUSED`. No storage objects/credentials were read and no external endpoint was contacted. The existing storage service was not started or replaced. Real image capture/upload/download cannot be declared operational until that existing store is available and the private-bucket integration is exercised.

## Files

- API: `apps/api/src/modules/visit-execution/{visit-execution.controller.ts,visit-execution.service.ts,visit-execution.module.ts}`; registered in `apps/api/src/app.module.ts`.
- Contracts: `packages/schemas/src/visit-execution.schemas.ts` and its `index.ts` export.
- DB: `packages/database/prisma/schema.prisma` and the migration above.
- Web: `apps/web/src/components/visit-execution/{start-visit-button.tsx,visit-execution-screen.tsx}`, `apps/web/src/app/(dashboard)/dashboard/visit-execution/[id]/page.tsx`, and the small Copilot customer-details entry change.
- Web API/i18n: `apps/web/src/lib/api/visit-execution.ts`, `apps/web/src/lib/i18n/visit-execution-messages.ts`, dictionary registration in `dictionaries.ts`.
- Regression suites: API `visit-execution.controller.spec.ts` / `visit-execution.postgres.spec.ts` and Web `visit-execution.spec.ts`.
- Explicit native verification: `tools/quality/visit-execution-native.cjs`; evidence `.quality/visit-execution/native.json`.

## Validation and gate

Focused execution: 15 API/SQL checks and 5 actual React server-render checks passed, with no failures/skips/TODOs. SQL checks run actual service commands, migration constraints and supplemental RIE SQL on approved test-only PGlite 0.5.8. They cover company/rep/route denial, Analysis Only/default-deny, SFA/Full ERP admission, strict actor input, repeat/overlapping starts and writes, stale versions, audit rollback, completed-state rules, photo replay/limits, storage outage and lost commit acknowledgement. React checks cover denied/empty/completed/analytical-outage states, RTL dropdowns, inert financial entries and Arabic/English key parity.

Final `pnpm quality --base f482d9bde14b94e3619e221d61a416b145874ca6` passed 589 checks across 135 suites, with zero failures/skips/TODOs/cancellations and all four API/database/schemas/Web typechecks. The separate `pnpm quality:postgres` passed 149 checks across 27 suites, also without failures/skips/TODOs; the final changed gate re-executed the isolated SQL suites including the final imported-note query. Prisma schema validation and `git diff --check` passed. Evidence: `.quality/changed.json` and `.quality/postgres.json`.

Six native PostgreSQL 18.6 checks passed on independent single-connection Prisma clients: alternate start identities, conflicting version saves, overlapping identical image upload with compensation, audit rollback, concurrent identical finish and the image cap race at 29→30. The script verifies the existing loopback test cluster's data directory, creates its own synthetic database and removes only that database on completion. It never loads `.env`; image storage is an explicit test double. Native testing caught Prisma's unsupported `void` advisory-lock result and verified the `$executeRaw` correction.

**System Design Gate: WARN.** The implemented local contract is covered by isolated SQL/security/render tests and native transaction races; this is not release approval. Important trade-off: reuse established analytical summaries separately from transactional visit commands, so a summary failure alone does not block saving field evidence. Saving still requires PostgreSQL and the small RIE customer-authorization lookup; loss of that authorization dependency fails closed. Remaining verification: actual device/browser camera flow, the currently unavailable private S3 upload/download integration and cleanup reconciliation, visual Light/Dark desktop/mobile RTL/LTR screenshots and representative analytical query plans. Server rendering/source checks do not establish those properties. No claim is made that external branch/deployment protection is enabled.

## Final verification — native services, no Docker (2026-10-22)

This section supersedes the earlier unverified app-session/visual status. After the explicit no-Docker instruction, no Docker/Compose/container command, repair or installation was used. Earlier attempts were stopped. Existing native PostgreSQL and separate local Node/Next processes were used. No operating or Production database was migrated; no push/deploy or dependency/provider installation occurred.

### Actual application and isolated database

- Real preview: `http://127.0.0.1:4518/dashboard/visit-execution/b01a32ed-3806-4c46-b8e5-6a3dd8050729`; API loopback `127.0.0.1:4519`. The browser tab is retained. This runs the actual Next screen and Nest AppModule, actual login, guards, RIE and Prisma, without mocked business responses or a session bypass. The isolated Next source copy avoids loading the operating `.env`; already cached approved fonts replace download transport only.
- Native server identity verified by SQL: `127.0.0.1:55561`, `SHOW data_directory = D:/Field Sales OS/.quality/wms/pgdata`. Created **only** `visit_execution_verify_d69a5c896fbc43dc8640e03575482f2f` on that pre-existing test cluster. The normal configured database on port 5432 was not accessed.
- Applied baseline migrations to the new empty database, seeded three synthetic users and four nonfinancial customer/route/employee metadata rows, then took a custom-format backup **before the Visit migration**. Verified its restore listing and the users table data. Backup: `.quality/visit-execution/final/before-visit-migration.backup`; SHA-256 `2c4c37659f106448b152e4c6b545305d732aed476449370323d04567f5d3c211`. This proves a readable archive, not a separate restore drill.
- Applied `20261022120000_visit_execution` to that new database only; three users/four canonical rows unchanged. The three new operational tables and explicit permission were verified. RBAC is role-based: in this fresh database exactly one SALES_REP account belongs to the fixture rep role. Only that role received `sfa.access` and `visits.execute`; no shared role in another database or other fixture user was granted access. Synthetic account: `visit-foundation@example.invalid`; test password/connection details remain in ignored local `runtime-private.json`.
- Browser path passed: Visit Copilot → today's sole authorized customer → Start visit → independent persisted Visit Execution. No financial facts were seeded. Collection balance/payment/rate, invoice/average and return rate display unavailable, with the three-month period and denominator definitions.
- Browser saved notes and NOT_ACHIEVED/OTHER with explanation; omitting explanation was visibly rejected. Reload restored the saved notes/reason. Selected COLLECTION as goal and completed the visit. Completed inputs are disabled and edit/finish controls disappear. Completion did not require any invoice.
- Actual native checks: one owned visit, version 3, status COMPLETED, goal COLLECTION, outcome NOT_ACHIEVED, OTHER explanation and notes persisted, one `visit.started` audit and one `visit.completed` audit. Three concurrent start requests resumed that visit. Two concurrent immediate finish replays and a start-key replay after completion returned the same closed visit without extra records/audits.
- Actual HTTP guards: anonymous 401; ANALYSIS_ONLY 403; missing `visits.execute` 403; customer outside assigned route 404. Another actor's and another company's fixture visits deny read/save/upload/photo URL with 404. Moving the rep to another route revokes read/photo-URL access. FULL_ERP access passed; fixture mode/route/permission were restored afterward. These checks do not establish the privacy policy of a storage service that is offline.
- Arabic RTL passed at 390×844 and desktop 1440×1000. Document widths 375 and 1425 respectively show no horizontal document overflow. Screenshots saved under `C:/Users/ahmed/.codex/visualizations/2026/10/22/01a16112-b957-7732-8617-ffad776cf265/`: `visit-execution-verified-desktop.png`, `visit-execution-completed-mobile.png`, `visit-execution-storage-blocked-mobile.png`. Physical camera capture and Dark/English visual journeys remain unverified in this pass.

### Image storage: BLOCKED, not a passed upload/read

The existing `apps/api/.env` targets `http://localhost:9000`. The project-provided startup for this endpoint is the MinIO service and bucket initializer in `docker-compose.yml`. No native MinIO service or installed `minio`/`mc` executable was found in the inspected local setup. The endpoint refuses the native loopback TCP connection (`ECONNREFUSED`). Docker was neither used nor repaired after the prohibition.

The browser selected a real PNG file and submitted multipart upload through the unchanged S3 provider/configuration/credentials. The endpoint returned **503** (including the existing client's bounded retries). UI explicitly says the photo was not saved; PostgreSQL contains **zero** photos for the visit. Canceling the pending image restored save/finish access, and the visit completed normally. No fake object, local-filesystem substitute, bucket/credential/provider change or successful photo row was created.

Actual upload → persisted object → reopen/read and private-bucket authorization remain **BLOCKED**. The API ownership/route denials were tested; real signed-object read/access cannot be certified without the store. No existing safe native storage alternative was discovered under the current setup. Next step requires approval to provision a native instance of the same S3-compatible store and private bucket with the existing configuration, or identification of an already approved running local instance; then repeat the real image round trip. This task did not install/provision it.

### Narrow fix and new evidence

Browser verification caught HTTP 500 in context: the four-operation supplemental plan also imposed a four-PostgreSQL-call ceiling, excluding hierarchy/source metadata and existing briefing work. The service now opens **one** context plan before invoking the existing briefing and shares Copilot's established 24-call ceiling/cache. No global budget, PostgreSQL concurrency, query formula, fact scope or response shape changed. Actual HTTP evidence records **10** RIE PostgreSQL executions, with bounded supplemental result limits unchanged. The new regression verifies request serialization and that the 25th call still fails; this is a corrected full-request accounting boundary, not a disabled admission guard. Native metadata-only fixtures do not prove large-data capacity or worst-case hierarchy fallback cost.

Changed in this verification: `visit-execution.service.ts`, new `visit-execution.context.spec.ts`, this report, reliability/resolved-issues notes. No UI rebuild, source migration modification or new financial operation was introduced. Ignored `.quality/visit-execution/final/` holds setup/API/web/HTTP verification helpers, backup and evidence; the test DB and local preview are retained for inspection.

Focused results: 20 existing Visit SQL/controller/React checks passed; the new RIE-plan test passed after correcting its fixture's notes-query response (21 unique checks passed, no final failures/skips/TODOs). API TypeScript check passed. Ten actual HTTP verification groups and native completion/replay/route checks passed. The 589/149 suites were **not repeated**, as requested; their earlier pass is historical evidence, not a rerun after this fix. Evidence files: `setup-evidence.json`, `http-evidence.json`, `context-evidence.json`, `finish-evidence.json`, `verification-summary.json`, `request-evidence.jsonl` in `.quality/visit-execution/final/`.

**System Design Gate: WARN — Foundation 001 remains open.** The independent native/browser/DB flow passed; image persistence/read/private-store integration remains BLOCKED for the precisely identified unavailable dependency. No successful real-image round trip or release readiness is claimed.

## Native image closure — no Docker (2026-10-22)

### Runtime and trusted source

The user explicitly authorized provisioning native MinIO with the existing local storage settings. No Docker, Docker Compose, container, Railway operation, push or deploy was used. The binary archive shown in search returned **HTTP 410 Gone** on direct download; no executable from that archive or an unofficial mirror was run. The [official MinIO source repository](https://github.com/minio/minio) documents source installation. Its [latest published security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) was built from the pinned official module:

- Tag `RELEASE.2025-10-15T17-29-55Z`; module `v0.0.0-20251015172955-9e49d5e7a648`.
- Module checksum `h1:6TdolSCLSs2nwm8i0PpWDqf9iX2Ty9WQK8wmr7dCnUM=`; normal Go module/checksum verification remained enabled through `proxy.golang.org` / `sum.golang.org`.
- Portable Windows Go `go1.27.3` from [go.dev](https://go.dev/dl/?mode=json), archive SHA-256 `f26081f438319757f8a1b46d7d0b2c5ec7583d4038e485e0aa725cfde7885fff`, verified before extraction. No global installation, PATH modification or application package dependency was added.
- Built with `go install -p 2 -trimpath -ldflags "-s -w" github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z`, `CGO_ENABLED=0`, `GOTOOLCHAIN=local`. Binary SHA-256 `bf99d110f995a68abae2e571ea481c9fd4c1da420baaf3ca27594cfe00fac4a5`. The standalone binary reports `DEVELOPMENT.GOGET`; its embedded Go module metadata identifies the exact pinned release, not an official precompiled artifact.

Native process serves the existing `http://localhost:9000` endpoint. Listener verification found only `127.0.0.1` / `::1`, with no public interface. `MINIO_BROWSER=off` and `MINIO_UPDATE=off`; no console listener or Windows service/autostart was installed. The existing local `STORAGE_*` settings and credentials are unchanged; the launcher asserts the known development endpoint and credentials before use. No Production credential was changed or supplied to MinIO. Bucket `field-sales-os` has **no public policy**.

Binary, compiler, build cache, provenance, logs and test object data are retained under `.quality/visit-execution/minio-native/`; objects live in its `data/` directory. The old `.docker-data` directories are untouched. The service was restarted on this same native data directory and retained the image.

To start it again after stopping the known test process, run from `D:\Field Sales OS`:

```powershell
node tools/local/start-minio.cjs
```

The repository launcher uses the retained verified binary/build provenance, reads existing local storage settings, starts hidden on loopback and verifies readiness/private bucket. It refuses an occupied port rather than replacing another service. Syntax and occupied-port guard checks passed; the running process and readiness stayed intact. Do not remove the retained native data/provenance folder if these test images are needed. This is a manual local process, not a service guaranteed to survive a machine restart. The launcher and other changes remain uncommitted.

### Actual image and browser journey

Actual photograph: [Brie on a Shelf](https://commons.wikimedia.org/wiki/File:Brie_on_a_Shelf.jpg), author **Iop90cwl**, CC0, 2,758×2,758 JPEG, 1,418,544 bytes. Original downloaded from Wikimedia; source SHA-256 `fd6c323a9f941dd4fc89664fc7d3f00b264cf9c22568412141a955e355968382`. This is an actual retail-shelf photograph used as a declared public test fixture, not generated imagery, a UI screenshot, a physical camera test or a claim that the image depicts our synthetic customer. The visit note explicitly identifies it as a public test photo.

The actual browser used Visit Copilot → customer `VERIFY-C1` → Start visit → choose `shelf-photo-cc0.jpg` as SHELF → save photo → save notes/goal/result → reload visit → View photo. Upload returned 201. Browser decoded the stored image at its natural 2,758×2,758 dimensions. The existing S3 provider returned the same bytes through a fresh signed URL; SHA-256 matched the source.

| Evidence | Verified result |
| --- | --- |
| Isolated database | `visit_execution_verify_d69a5c896fbc43dc8640e03575482f2f`, native test cluster `127.0.0.1:55561`; `field_sales_os` never accessed/migrated |
| New visit | `87fccc55-d468-4ca2-bd60-cd87d343da49`, customer `VERIFY-C1`, rep `verify-rep`, company `verify-a` |
| Photo | `26baa4e5-7a43-42c9-b059-09fd9ee8c1d8`, SHELF, JPEG, 1,418,544 bytes; company/visit relation and customer via visit verified |
| Object | Server-generated `companies/verify-a/visits/<visit>/<photo>` key; real native MinIO storage |
| Reopen/read | API 200 and browser image decoded after page reload and again after native MinIO restart; exact source hash retained |
| Private access | Unsigned object GET 403; unsigned bucket listing 403; altered signature 403; actual signed URL expires after 60 seconds and expired request returns 403 |
| API isolation | Other same-company user and other-company user cannot read this visit or obtain its photo URL. Missing-role permission gets 403; even temporarily granting the same operation role to these synthetic negative-test users still yields 404 for visit/photo. Fixture roles restored; one authorized fixture rep remains |
| Wrong resource reference | Owner requesting this photo through their different visit receives 404 |
| Retry/closed state | Same upload identity after completion returns the same photo; one photo row and one photo audit remain. New photo command against closed visit receives 409 |

Final actual preview: `http://127.0.0.1:4518/dashboard/visit-execution/87fccc55-d468-4ca2-bd60-cd87d343da49`. Browser tab retained. Screenshots: `C:/Users/ahmed/.codex/visualizations/2026/10/22/01a16112-b957-7732-8617-ffad776cf265/visit-execution-real-shelf-photo.png` and `visit-execution-image-verified-full.png`.

### Real storage outage and recovery

After the successful upload/read, stopped **only** the native MinIO process launched for this test, after verifying its executable and data-directory identity. Port 9000 then returned `ECONNREFUSED`. While it remained stopped, the browser updated notes and saved the visit, then finished it with MARKET_DOCUMENTATION / ACHIEVED, without an invoice. PostgreSQL and durable audit verified both successful commands occurred after the recorded storage stop. Visit status COMPLETED, version 3; one completion audit. No pending/unuploaded file was represented as saved.

Restarted native MinIO on the same data directory, reloaded the completed visit and displayed its image again. Real S3 bytes matched the original SHA-256, proving persistence beyond a running process or browser memory. Photo replay kept one row/audit; completed-state fields stayed disabled. MinIO remains running for the retained local preview.

### Changes, focused results and closure

- Added `tools/local/start-minio.cjs`; updated this report, `RESOLVED_ISSUES.md` and `ENGINEERING_RELIABILITY.md`. No application UI/API/provider/schema/migration/package/environment-file change in this image-closure pass.
- Only the previously verified isolated database received this new test visit/photo/notes/audits and synthetic authentication sessions. Negative-test users' fixture role changes were restored. No migration ran in this pass and the operating database `field_sales_os` remained untouched.
- Three focused real integration scripts passed: `verify-photo.cjs` (byte parity/private access/other actor and tenant), `verify-outage.cjs` (native service down during actual save/complete), `verify-final.cjs` (disk persistence, expiration, replay and closed-state denial). Native startup/readiness and launcher syntax/occupied-port checks passed. Browser journey and decoded image verified. No comprehensive 589/149 suites were repeated.
- Evidence in `.quality/visit-execution/minio-native/`: `build-evidence.json`, `build-modules.txt`, `startup-evidence.json`, `photo-evidence.json`, `outage-start.json`, `outage-evidence.json`, `final-evidence.json`; local helper scripts retained. Signed URL evidence is kept separately in `signed-private.json` and is already expired; no reusable signed URL or credential is published in this report.

**System Design Gate: PASS for Foundation 001's isolated local acceptance. Foundation 001 is functionally closed locally; the real image blocker is resolved.** This is not release approval or a production-capacity claim. Important retained limit: the upstream MinIO Community repository is archived/no longer maintained; this pinned build is confined to synthetic local testing. Production runtime selection/support, physical-device camera permission/capture, representative large-data performance and release gates remain outside this local closure. No temporary store/provider substitute or admission bypass was introduced.

## Direct camera alongside upload (2026-10-22)

Added an explicit **Open camera** action, separate from ordinary file upload. The previous `capture` attribute delegated to a mobile file picker and did not provide an in-app camera on desktop. The new shared-design dialog requests video only (no microphone), prefers the rear camera, and offers live preview, capture, review, retake, use-photo and cancel. The camera opens only after a deliberate click; capture stays local until accepted and the existing Save visit photo action is submitted. JPEG frames are bounded to a 1,920-pixel longest edge and the existing 8 MiB limit. No provider/API/DB/permission change, native dependency or Docker use was needed.

Camera tracks stop on dialog close, navigation/unmount and after capture. Pending permission responses are invalidated; late streams are stopped rather than retained. Local preview object URLs are revoked. Denied permission, missing device, busy camera, unsupported/insecure connection and capture failures have Arabic/English states, preserving ordinary upload. The file picker no longer forces camera capture, so both options remain distinct. Existing all-channel access and completed-visit restrictions are preserved.

Files: `visit-camera.ts`, `visit-camera-capture.tsx`, `visit-camera.spec.ts`, `visit-execution-screen.tsx`, `visit-execution.spec.ts` and `visit-execution-messages.ts` under the existing web source directories. Eleven focused camera/React checks passed, including permission races, late stream cleanup, video-only constraints, size/encoding failure, completed/unauthorized state and dictionary parity. Web TypeScript check passed; broad suites were not repeated.

Actual preview at `http://127.0.0.1:4518/dashboard/visit-execution/76dd35d4-d380-47b7-b119-f0114e2b4c23` shows Open camera and Upload image, opens the translated camera dialog and cancels back to the visit. In the embedded browser, the real media request remained waiting for camera permission; no physical frame or capture-to-storage round trip is claimed. No camera mock was substituted in that browser. **System Design Gate: WARN for this camera enhancement's device acceptance** until permission/live frame/capture are exercised on a supported camera-equipped browser. The existing upload/storage native acceptance remains passed. Screenshot: `C:/Users/ahmed/.codex/visualizations/2026/10/22/01a16112-b957-7732-8617-ffad776cf265/visit-execution-camera-and-upload.png`.
