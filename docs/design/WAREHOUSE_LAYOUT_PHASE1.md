# Warehouse layout — manual review stage

Date: 2026-10-26. Route: `/sfa/warehouse`.

The reference image supplies information hierarchy only. The implementation uses
Murshidak's shared cards, buttons, tokens, Lucide icons and existing translation
provider. Navigation wraps on mobile and becomes a local side rail on wide screens.

Home contains four indicators from the existing warehouse summary, balances,
expiry follow-up and section cards. Receiving and rep loading open the existing
workflow views; inventory contains coverage, quarantine, returns, products, lots
and counts; the movement ledger has its own section. Existing query contracts,
scope, refresh rules and operational commands are preserved. Panels remain mounted
when hidden so ordinary section navigation retains their state.

## Existing capability limits

- Actual account permissions and server enforcement remain authoritative. There
  is no role switch. Company-admin operational read restrictions remain intact.
- Warehouse registry creation/management is currently restricted by the server
  to `COMPANY_ADMIN`, `company.manage` and enabled `sfa-setup`. The link follows
  that boundary; this phase does not grant warehouse managers new server rights.
- No inter-warehouse transfer UI was found. Its section explains unavailability
  and offers no command or simulated workflow.
- Review/approval task totals are not invented from partial paginated lists.
- PDF attachment and document capture are recorded requirements for a separate
  phase, with no upload/camera controls implemented here.

## Verification and handoff

Focused offline server-rendering tests cover Arabic/English navigation, actual
balances, receipt deep links, restricted administrator display and the registry
role boundary. Existing server admission regressions cover company, mode, screen,
permission and direct-command enforcement. Web TypeScript is checked separately.

No browser automation, production access, push, deployment, database/API/RIE
change or load test is part of this stage. The broad `pnpm quality --base` command
is deferred because the user explicitly excluded comprehensive long checks;
the working tree also contains extensive unrelated engineering changes. Focused
checks are not a complete release gate.

System Design Gate: PASS — presentation/navigation only; no architecture change.
Scalability Gate: N/A — unchanged data contracts and query admission; no capacity
claim or new performance measurement.

Manual review remains required in Arabic RTL and English LTR, Light/Dark, desktop
and 767/480/430px widths, using actual manager/keeper/restricted accounts. Review
warehouse selection, all sections, receipt links, forms, loading/empty/error
states and keyboard focus. Stop at this handoff before additional development.
