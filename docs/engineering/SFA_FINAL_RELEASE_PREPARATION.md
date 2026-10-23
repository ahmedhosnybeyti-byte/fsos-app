# SFA final Production release preparation — 2026-10-20

## Decision

| Gate | Result | Evidence / remaining action |
| --- | --- | --- |
| Backup Recovery | **BLOCK** | Real encrypted archive recovered on Linux without DPAPI. A durable recipient private key in the user's vault and a verified external archive copy are still not configured. |
| Production Migration Safety | **PASS** | Two additive migrations verified on the real restored PostgreSQL 18 schema with rollback; fresh read-only Production gate still shows both tables absent, no SFA grants, and no enabled setup screens. |
| Security | **PASS** | Explicit company mode, company screen, active authenticated COMPANY_ADMIN, subscription and both permissions remain required. Existing 34 isolation/authorization checks remain valid; no application code changed in this preparation. |
| Design System | **WARN** | Actual Light/Dark desktop/mobile previews and screenshots prepared with synthetic data. User visual approval has not been received. |
| Release Recommendation | **NO-GO** | Finish actual off-device recovery custody and visual acceptance, then obtain explicit deployment approval. |

`System Design Gate: PASS` for the reviewed code and isolated preparation;
the operational release remains blocked. The trade-off is portable encrypted
recovery with independent key custody instead of relying on one Windows profile.

## Source and environment

- Application baseline remains local commit `781fc80` on `codex/erp-foundation`.
  There were no tracked uncommitted changes at the start of this task.
- New uncommitted preparation files: the portable key-envelope exporter,
  cross-platform recovery CLI, five CLI security tests, and this report/docs.
  They do not alter application behavior. No new commit, push or deploy was made.
- Existing `.tmp*` archives/checkouts were left untouched. Real backups, keys,
  test fixtures and preview helpers are excluded from release artifacts; backup
  material remains outside Git. No key or secret was put in this report or Drive.
- RIE, Smart Loading and Visit Copilot implementation paths have no changes in
  the SFA release delta. Existing successful regression evidence is reused;
  Production runtime smoke checks remain a post-deployment step, not a claim
  that a future deployment has already been tested.
- Railway read-only status showed API/web/PostgreSQL online and no staged or
  applying work. PostgreSQL has one existing warning; its type could not be
  retrieved through the bounded notification query. Review it before the window.

## Independent recovery

The original AES archive is valid and a full PostgreSQL 18 restore has already
passed. Its current `.key.dpapi` alone is insufficient if the Windows profile or
device is lost. C, D and E are partitions of the same NVMe device, so copying
between them does not create an independent recovery location.

Prepared tools:

- `tools/release/export-portable-recovery-key.ps1`: unwraps the existing key only
  in memory and seals it to a selected RSA recipient (3072 bits or more,
  OAEP/SHA-256). Never prints the plaintext key.
- `tools/release/recover-portable-backup.mjs`: cross-platform recovery using the
  recipient private key/passphrase supplied through stdin, not command arguments.
  Authenticates before decrypting, refuses overwrite, verifies SHA-256, and
  removes newly created plaintext if verification fails.

A temporary recipient was generated in memory for the test. Its encrypted
private key was supplied directly to Linux Node 22 through stdin and was never
saved. Linux received the actual encrypted archive, HMAC, metadata and RSA
envelope, with **no DPAPI sidecar**. It authenticated and decrypted all
114,785,871 bytes to the exact previously restored dump SHA-256. This confirms
portability, not durable custody: the test recipient is deliberately ephemeral
and is not an actual recovery escrow.

Five new synthetic-data checks passed: exact recovered bytes; wrong recipient
rejection; tampered HMAC rejection before plaintext output; overwrite refusal;
and cleanup on checksum failure. These checks do not access Production. Existing
101 tests, the full restore and Linux application build were not rerun.

To close **Backup Recovery BLOCK**:

1. Identify the user's password vault and approved external storage destination.
   The user selected this approach but has not supplied the actual names/paths.
2. Retain a durable, encrypted recipient private key and its recovery password in
   that vault, with access recoverable independently of this device. Only its
   public key is needed by the local envelope-export tool. No private key,
   passphrase or plaintext archive key belongs in chat, Git, reports or Drive.
3. Wrap the archive key for that durable recipient. Copy the encrypted archive,
   HMAC, encryption metadata and wrapped envelope to the approved external store.
   Do not treat the DPAPI sidecar as the independent recovery key.
4. Download/read back the external copy and perform recovery with the retained
   vault recipient on a clean environment without the Windows profile. Compare
   the known dump SHA-256 before marking custody PASS. The existing full database
   restore need not be repeated when the recovered bytes are identical.

No actual vault/external-storage write has been attempted because the destination
has not been identified. The original valid backup has not been re-keyed or
replaced by the test envelope.

## Migration and permission review

Pending, unchanged SQL files:

1. `20261019090000_company_operating_settings`: adds the mode enum and separate
   optional settings table; default `ANALYSIS_ONLY`. Registers `sfa.access` only.
2. `20261019120000_sfa_warehouses`: adds the warehouse registry, company FK and
   tenant-prefixed indexes. No balances, facts, Excel/RIE writes or backfill.

The restored-source ledger had 43 records / 42 applied migrations. Applied SQL
matched repository content allowing LF/CRLF; only the two expected migrations
were pending. Both passed against the restored PostgreSQL 18 schema inside
BEGIN/ROLLBACK, with no backfill and no role grant.

Fresh read-only check on 2026-10-20 confirmed the two new tables are still absent,
`sfa.access` role grants are zero, and enabled `sfa-setup` screens are zero.
Missing settings resolve to ANALYSIS_ONLY, and missing screen configuration to
HIDDEN. Only Super Admin can change company mode/screen/global role grants.

User access additionally requires active membership in the authenticated company,
COMPANY_ADMIN, `sfa.access` + `company.manage`, an active subscription, persisted
SFA mode and ENABLED screen. There is no implicit Super Admin tenant bypass.
**Role grants are global, not individual-user grants.** Before any later grant,
review all holders of the role and all companies with open SFA/screen gates.
Do not describe this model as selective per-user SFA permissions.

Railway's current API pre-deploy configuration already contains:

`pnpm --filter @field-sales-os/database migrate:deploy`

The future release must designate that existing hook as the sole migration
executor for one serialized API release. Do not also run a manual migration or
move migration commands into per-replica startup. No setting was changed here.

## Visual review

The previous Linux standalone artifact is reused, with no rebuild or application
configuration changes. API uses a fresh in-memory PGlite database, synthetic
company/employees/warehouses and generated local sessions; it never uses the
restored Production database. API networking is restricted to loopback.

Open the local synthetic-session entry point manually:

- Light: <http://localhost:5338/__review?theme=light>
- Dark: <http://localhost:5338/__review?theme=dark>

Each entry leads to `/sfa/setup`; no real account/password is required. If a
session expires and `/login` appears, open the entry link again. Switch theme
and language through the existing shell controls. Use browser responsive mode
at 390×844 for mobile and 1440×1000 for desktop. No LAN exposure was enabled.

Screenshots captured from the real rendered interface, not mockups:

- [Light desktop](../../.tmp/sfa-final-review/screenshots/light-desktop.png)
- [Dark desktop](../../.tmp/sfa-final-review/screenshots/dark-desktop.png)
- [Light mobile](../../.tmp/sfa-final-review/screenshots/light-mobile.png)
- [Dark mobile](../../.tmp/sfa-final-review/screenshots/dark-mobile.png)
- [Mobile warehouse dialog](../../.tmp/sfa-final-review/screenshots/light-mobile-dialog.png)

Shared Cairo, shell, semantic tokens, glass Card, buttons, dialog and RTL/LTR
controls were retained. Light/Dark mobile DOM width matched the 390px viewport.
The real dialog initially focused the code input. English LTR was inspected
through the language control. These are technical observations; visual approval
is still exclusively the user's decision. Current-turn browser control was
denied by the browser URL policy, so the entry links must be opened manually;
the previously saved screenshots remain available.

## Deployment sequence — only after explicit approval

1. Close independent recovery custody and receive visual acceptance. Resolve or
   explicitly assess the existing PostgreSQL warning. Obtain explicit release
   approval; this document and the earlier review GO are not that approval.
2. Freeze the approved source commit and clean release artifact. Exclude `.tmp*`,
   `.local-backups`, credentials, test accounts and unrelated WIP. Reconfirm live
   deployment IDs, source ledger and no concurrent release immediately before
   the window; renew the database backup if the window is delayed.
3. Keep every Production SFA company/screen gate closed and create no role grant.
   Release API first, using the existing pre-deploy hook as the one migration
   executor. Stop on migration failure; do not modify migration history to force
   success. Existing tables/facts and legacy application behavior remain intact.
4. Verify readiness/health and bounded authenticated existing-company reads:
   Excel/RIE, Smart Loading and Visit Copilot. Use existing snapshot results, not
   uploads, manufactured business records or unnecessary recalculations. Verify
   direct SFA access remains denied.
5. Release the web artifact. Verify login, navigation and the existing screens;
   SFA remains hidden/denied by default. Do not activate any company as part of
   these checks.
6. If any release check fails, stop rollout and revert application images to the
   recorded API/web deployments below. Keep the additive tables in place; do
   not run destructive down SQL, delete operational rows, or restore Production
   automatically. Investigate migration failures separately before retrying.
7. Only a separately authorized later activation names the intended company and
   reviews global-role impact, company SFA mode, company screen, active member
   role/permissions and subscription. Record the Super Admin audit trail.

Rollback anchors verified read-only in Railway:

- API: `243c7e34-1a29-4552-aeb0-0b3971f6821b`
- Web: `8dcaf605-5292-461c-bd10-e6e388308b56`

No push, deploy, Production migration, Production permission grant or company
activation was performed. Awaiting the missing custody details, visual approval,
and explicit release authorization.
