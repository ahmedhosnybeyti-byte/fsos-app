# Google Sheets read-only backend diagnostic

This backend command uses Google's official `google-auth-library` with only
`https://www.googleapis.com/auth/spreadsheets.readonly`. It does not expose an HTTP
endpoint, import records, write to PostgreSQL, or modify the spreadsheet/sharing.
PostgreSQL remains the operational source of truth. No deployment or scheduler is
required for this test.

## Secure setup

1. In a Google Cloud project, enable Google Sheets API and create a dedicated
   service account. No project IAM role or domain-wide delegation is required.
2. Share only the target private spreadsheet with the service account email as
   **Viewer**. Keep general access Restricted.
3. Put `GOOGLE_SHEETS_CLIENT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY` in backend
   environment secrets. For a local test, the ignored `apps/api/.env` is supported.
   Existing process variables take priority. The private key is PEM; literal
   backslash-n line breaks are also accepted. Do not paste keys into chat, source,
   shell command arguments/history, or logs. Do not commit a service-account JSON.
4. Optional settings and defaults:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`: `1RNeBcdTZY7z6JrUePfvYhgX_F_Zu-wrmDwqOASsBU0w`
   - `GOOGLE_SHEETS_SHEET_NAME`: `Sheet1`
   - `GOOGLE_SHEETS_TEST_RECORD_ID`: `TEST-AUTO-001`

From `D:\Field Sales OS`:

```powershell
pnpm --filter @field-sales-os/api sheets:test-read
pnpm --filter @field-sales-os/api sheets:test
```

## Read contract and result

One bounded Sheets values GET requests `Sheet1!A1:AZ101`: at most 52 columns,
one header row and 100 data rows. This small, explicit external-ingestion
exception is intended only for the connectivity test. It never scans the full
spreadsheet or loops through pages. Keep the test record within this window.
The request has a 15-second timeout and 1 MiB response cap. The Sheets data GET
has retries disabled; authentication is managed separately by Google's library.

Row 1 is returned as `columns`. A data row matches only when one cell exactly
equals the test identifier (no substring or trimming). Because the source ID
column is not yet specified, this diagnostic checks each cell in the small
window. Duplicate matching rows cause an error. The result preserves formatted
cell values and column order; it returns only the matching row, its sheet row
number, rows read/returned, and elapsed time. Unmatched data rows are not logged.

Exit 0: one record found. Exit 2: absent from this test window (not proof of
absence elsewhere). Exit 1: configuration, API, or ambiguous-result error.
SDK errors are replaced with fixed messages to prevent credential leakage.
Successful output contains the requested record; treat it as business data.

## Validation (2026-10-17)

Six isolated tests passed: missing credentials, one bounded GET and exact match,
missing record/window semantics, duplicate matches, secret-safe errors, and
oversized response rejection. These use mocked API responses, not live data.
The actual command was attempted and stopped before network access because
service-account variables were absent. Live `TEST-AUTO-001` retrieval and real
latency remain unverified until credentials and private Viewer sharing exist.
No Google file contents or sharing settings were changed.

A future automatic importer must use a separate approved ingestion contract,
company/source mapping, bounded batches and PostgreSQL newest-wins/upsert rules.
Do not use this diagnostic as a runtime screen data source.

References:
- https://developers.google.com/identity/protocols/oauth2/service-account
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get
