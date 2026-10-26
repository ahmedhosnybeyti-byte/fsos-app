# Supplier receiving UI — local review

Worktree: `D:\Field Sales OS\.worktrees\supplier-receiving-ui`
Branch: `codex/supplier-receiving-ui`
Review base: `f482d9bde14b94e3619e221d61a416b145874ca6`
Route: `/sfa/warehouse/suppliers` (optional `?warehouseId=...`).

## Scope

- Two tabs: supplier receipts and supplier returns. Main content is the
  paginated document list and clearly labelled current-page indicators.
- Create/edit receipt and create return open in a responsive, direction-aware
  drawer. Existing stock quantities, batches, expiry, schemas, command/version
  and idempotency behavior are retained from the existing WMS forms.
- Uses the existing ProductPicker, WMS API clients, operation permissions,
  translation provider, theme tokens and shared UI components.
- Form presentation is isolated in new supplier files to avoid edits to the
  warehouse work in the other chat. The shared WMS forms/panels, warehouse home,
  navigation, APIs, schemas, SQL, database and RIE are not changed.
- Only shared integration edit: four additive lines in dictionaries.ts to
  register the separate bilingual supplier dictionary.
- No new roles, role switcher, permission grants, mock records or dependencies.
  Visibility follows authenticated permissions; existing server commands still
  enforce company, assigned warehouse and operation permissions.
- Existing submitted/reviewed receipt correction, cancellation, reversal and
  supplier handover remain accessible when permitted by the existing workflow.

## Existing contract limits

- Attachment storage/camera/PDF upload is not implemented by the current WMS
  document contract. The UI records this as a separate-phase requirement with
  no upload control.
- The supplier return API has no edit/return-to-draft command. No correction
  button is fabricated. The existing supplier return actions remain available.
- No global document counts or values are provided by the existing list
  contracts. Indicators aggregate at most the displayed 20 headers, explicitly
  not all documents. Search/pagination remain server-side.
- Receipt dates shown are existing creation dates. No new document fields.
- The new route is directly reviewable. Adding its entry to the warehouse home
  is left for coordinated integration with the other chat.

## Verification

- Shared schema compilation passed.
- Initial TypeScript check found two missing labels; both corrected.
- Mandatory `pnpm --config.verify-deps-before-run=false quality --base
  f482d9bde14b94e3619e221d61a416b145874ca6`: BLOCK, 370 passed,
  zero failed, nine skipped. The base runner selected existing mixed SQL tests
  without an isolated PostgreSQL runtime and consequently did not run its
  automatic typecheck stage. No tests, budgets or gate rules were changed.
- Standalone web TypeScript check passed (exit 0) after correcting the labels.
  Dependency junctions require an unsandboxed local compiler invocation;
  a sandboxed attempt could not resolve dependencies and is not counted as
  valid compiler evidence.
- Rendered/manual UI verification and live role/warehouse denial journeys have
  not been run. No Production data, load test, push, merge or deployment.

System Design Gate: BLOCK for engineering acceptance due to skipped mandatory
checks; the UI change is available for manual review.

Scalability Gate: WARN. Scenario: existing paginated supplier document lists,
at most 20 returned document headers per page, one active tab and detail fetched
only on selection. No page traversal or polling. No synthetic API execution was
performed; concurrency, SQL count, scanned dataset size, API p95, RAM and database
bottleneck were not measured. This UI review is not capacity/release evidence.

## Manual review

Review Arabic RTL and English LTR in light/dark mode at desktop, 767px, 480px
and 430px. Check keyboard focus and drawer closing, loading/error/empty states,
warehouse changes, search/pagination, current-page indicator labels, long
references, and exact quantities/expiry.

With existing authorized keeper and manager accounts, check that only permitted
actions appear, receipt drafts can be edited/submitted, managers can review,
approve or return receipts for correction, and supplier returns follow their
existing review/post/handover path. Confirm server rejection using an account
without the operation permission and one without access to the warehouse.
