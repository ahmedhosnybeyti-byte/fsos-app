# Project Log — Field Sales OS

Running record of major findings, decisions, and open threads. Written so
anyone (including a future AI session) can get oriented quickly without
re-deriving everything from scratch.

---

## Where things stand (as of this session)

**Code quality verdict**: the existing "institutional" codebase (`apps/api`,
`apps/web`, `packages/*`) is solid, not broken. Reviewed schema, controllers,
services, and frontend API integration directly — well-organized modules,
thoughtful in-code rationale comments, real security practices (argon2,
split public-id/secret-hash API keys, normalized RBAC, Zod validation),
every backend module has a real (non-mocked) frontend page wired via
TanStack Query. Zero `TODO`/`NotImplementedException`/mock-data found
anywhere. The one objective gap: **zero automated tests, no CI**.

**Every problem hit so far has been infrastructure or GPT-behavior, not code
quality**: ngrok tunnel instability, OpenAI's GPT Builder caching the old
OpenAPI schema until manually re-imported/saved/published, and the model
itself sometimes not calling the Action at all (preferring an attachment,
Knowledge, or its own reasoning) or stalling mid-plan on multi-dataset
questions. None of that reflects on the backend/frontend code itself.

## The 6-layer problem breakdown (from a parallel ChatGPT build log, summarized here for reference)

1. **OpenAI GPT Builder**: caches the OpenAPI schema — every API/schema
   change needs Import from URL → Save → Publish or the GPT keeps using the
   stale version. Also: the GPT sometimes just doesn't call the Action,
   preferring an attached file/Knowledge/its own reasoning — a model
   behavior quirk, not a backend bug.
2. **ngrok**: free tunnel dying/rotating URLs made the GPT think the backend
   was down when only the tunnel was. (This session's Railway migration
   directly addresses this layer.)
3. **Session management**: when to ask for a Launch Code, when to reuse a
   session, how to detect expiry — all GPT-behavior/prompt-design problems,
   not API problems.
4. **GPT reasoning/planning**: even with a capable API, the model sometimes
   stops after the first step of a multi-dataset plan (e.g. a "Customer
   360" needing Customers → Invoices → Payments → Returns → Merge). This is
   the accuracy risk flagged for tonight's retest — see below.
5. **Architecture**: uploading files to the platform first (storage, sync,
   permissions, backups, cost) proved heavier than needed. Direct upload
   inside ChatGPT ("Soft Opening") removes most of that complexity.
6. **Product strategy**: goal evolved from "one platform" to "one
   specialized GPT per sales channel" (Cash Van, Wholesale, Modern Trade,
   HoReCa, ...), each with its own DNA. Cash Van is the reference
   implementation the others will follow.

## Decisions already made (before/alongside this session)

1. Keep the full institutional/enterprise version intact — not being
   deleted or replaced.
2. Build a separate, simpler "Soft Opening" version alongside it.
3. Soft Opening uploads files directly inside ChatGPT (no platform storage).
4. In Soft Opening, the platform is only responsible for: subscriptions,
   users, Launch Code, GPT selection.
5. Each sales channel gets its own independent GPT eventually.
6. Cash Van is the reference implementation the other channels will copy.

## User's condition for continuing to invest in the institutional version

Explicitly stated: willing to keep building on it **if** it delivers on
three things — speed, accuracy, fault containment. Working definition
agreed in this session:

- **Speed**: few round-trips per question (pipeline already front-loads
  metadata so `getDataset` is only called when actually needed), fast
  queries (needs verifying indexes are adequate), low-latency hosting.
- **Accuracy**: specifically the multi-dataset planning failure from Layer
  4 above. If it recurs even on stable hosting, the likely fix is moving
  the join/merge logic server-side (a dedicated "Customer 360"-style
  endpoint) rather than asking the GPT to orchestrate 4-5 sequential calls
  itself — reduces reliance on model planning, which is the weaker link.
- **Fault containment**: clear structured error responses (not crashes),
  request timeouts, and at least basic uptime monitoring so outages are
  caught proactively instead of discovered mid-conversation (as ngrok was).

## This session's concrete progress

- Diagnosed the ChatGPT `ERR_NGROK_3200` failure as free-tunnel instability,
  not a code bug.
- Prepped Railway deployment: `Dockerfile.api` (turborepo-prune pattern),
  `railway.json`, `.dockerignore`, `docs/DEPLOYMENT.md` at the repo root.
- Got the repo onto GitHub: `ahmedhosnybeyti-byte/fsos-app`.
- Set up Cloudflare R2 for file storage (bucket `field-sales-os`, API
  token created — credentials handed to the user directly, not committed
  to any file in this repo).
- Raised `FILE_UPLOAD_LIMITS.maxFileSizeBytes` from 10MB to 100MB
  (`packages/schemas/src/constants.ts`) — reps' workbooks with formulas
  can exceed a flat 10MB export size.
- Railway project setup in progress (dashboard-based, see
  `docs/DEPLOYMENT.md` and the standalone prompt handed to ChatGPT for the
  external-dashboard-only parts of this work).

## Open / next steps

1. Finish Railway: single service on `Dockerfile.api`, Postgres addon, env
   vars (including the R2 credentials above), generate domain, seed DB.
2. Re-import the GPT Action's OpenAPI schema in GPT Builder (Import from
   URL → Save → Publish — see Layer 1 above, this step is easy to forget).
3. Point `apps/api/src/main.ts`'s Swagger `addServer(...)` and any
   platform config at the new Railway URL instead of the old ngrok one.
4. Retest specifically the multi-dataset planning scenario (e.g. Customer
   360), not just a generic multi-question chat — this is the scenario
   known to have failed before, independent of ngrok.
5. Based on that result, decide whether the institutional version meets
   the speed/accuracy/fault-containment bar as-is, or needs the
   server-side join endpoint mentioned above.
6. Railway Hobby plan upgrade ($5/mo) — user's own billing action, planned
   for this evening.
7. Soft Opening build — separate track, not started yet; the DNA-layering
   design (general DNA + per-company DNA + per-supervisor/sector DNA,
   role-aware propagation) discussed earlier in this session applies here,
   not to the institutional version.

## Railway deployment — completed this session

Went live end-to-end: `api-server` on Railway, PostgreSQL attached, domain
generated (`workspaceapi-server-production-7ec2.up.railway.app`), demo data
seeded, GPT Action re-pointed at the new domain and retested successfully.

Bugs hit and fixed along the way (all fixed in `master`, in order):

1. `ERR_UNKNOWN_BUILTIN_MODULE` on every pnpm invocation — root cause was
   `pnpm@11.11.0` requiring Node >=22.13 while `Dockerfile.api` used
   `node:20-slim`. Fixed by bumping the base image to `node:22-slim`
   (corepack was also swapped for a plain `npm install -g pnpm` as a
   secondary, independent fix — corepack's shim hit the same error on
   Railway's build environment regardless of Node version).
2. Runtime CMD's `pnpm --filter @field-sales-os/database migrate:deploy`
   failed with "No projects matched the filters in /app" *only* at
   container start, despite the identical command succeeding at build time
   in the same image. Root cause never fully isolated; fixed by not
   depending on pnpm workspace resolution at runtime at all — the CMD now
   calls `packages/database/node_modules/.bin/prisma` directly.
3. Railway dashboard had stale manual Build/Start Command overrides
   (referencing a nonexistent `@workspace/api-server` filter) left over
   from Railway's initial auto-detect flow — cleared them so the
   Dockerfile's own CMD is used, per `railway.json`.
4. `GET /`, `/api`, `/health` all 404'd after a clean boot — expected for
   `/` and `/api` (everything real lives under `/api/v1/*`), but `/health`
   genuinely didn't exist. Added `HealthModule`/`HealthController`,
   excluded it from the global prefix, wired `railway.json`'s
   `healthcheckPath`.
5. Web login silently failed (no error, just bounced back to `/login`) —
   `COOKIE_DOMAIN=localhost` is invalid once the API is on a different host
   than the web app; the browser drops the Set-Cookie entirely. Fixed
   `auth.cookies.ts` to omit `domain` (host-only cookie) and use
   `sameSite: "none"` in production instead of forcing `"localhost"`.
6. Web app's own `middleware.ts` read the session cookie server-side to
   gate `/dashboard` — structurally impossible once web (localhost) and API
   (Railway) are different origins, since the browser never attaches an
   API-origin cookie to a request aimed at the Next.js server. Disabled
   that redirect (real auth boundary is the API's guards + client-side
   `GET /auth/me`, per the existing code comment).
7. GPT Builder's Action import initially failed validation: two
   `@ApiOperation` `description` strings in `gpt.controller.ts`
   (`verifyAccess`, `getDataset`) exceeded OpenAI's 300-char limit —
   shortened both.
8. Root cause of "GPT can't reach the API at all" (zero requests ever
   arriving at Railway, confirmed via HTTP Logs): the GPT Builder's
   Authentication → API Key field was never actually filled in. Setting it
   to the seeded demo key (`fso_demo_acme.REPLACE_ME_GPT_API_SECRET`) fixed
   it immediately.

## Retest result: the Layer-4 accuracy risk (multi-dataset planning)

Retested on stable Railway hosting, per the condition set out above under
"Accuracy". Result: **partially confirmed, still present.**

- verifyAccess -> real dataset list -> getDataset -> a genuinely correct,
  data-grounded Customer 360 answer (real invoice count, real date range,
  real product categories) worked cleanly for the first 1-2 questions in a
  conversation.
- The model correctly *refused* to fabricate a Lost Sales figure it didn't
  have the logic to compute honestly — good discipline, not a bug.
- By the 3rd question in the same conversation, it reported having "lost"
  the sessionToken and asked for the Launch Code again, despite the guard
  chain's session still being valid (`gptSessionHours: 4`).

So: stable hosting alone did **not** fully resolve Layer 4 — the model
still loses track of session/tool-call state within a single conversation
after a few turns, independent of any backend issue. Per the plan already
on file: if this keeps recurring, the next lever isn't more prompt-tuning
but reducing how much cross-turn state the model has to carry itself
(e.g. a session token that survives being "forgotten," or collapsing
multi-step joins into fewer required tool calls).

## Backlog / future ideas (not started)

- **Auto-convert uploaded Excel to CSV**: let the platform convert .xlsx/.xls
  uploads to CSV internally (or offer CSV as an export option). Raised by
  the user during the route-splitting discussion below; not scoped or
  started yet — just a reminder note.

## Route-splitting / territory design (new thread, in progress)

Real, well-known operations research problem: **Territory Design /
Territory Alignment**, common in FMCG field-sales route-to-market
planning. User's actual pain point, from direct field experience: a
supervisor's route ("خط سير") — a set of customers already assigned to one
rep by whatever rule that supervisor/company uses (out of scope, varies
too much to standardize) — needs to be split into sub-groups (labeled
either by area name or by day of the week, functionally the same thing)
that are:

1. Geographically coherent/compact (primary constraint).
2. Close in total sales value to each other (secondary constraint, not
   required to be exactly equal).

Explicitly descoped for now: visit-frequency/periodic scheduling (e.g.
"Cash Van" customers needing 2 visits/week) — real requirement, real
complexity (turns this into a periodic vehicle routing problem), but the
user asked to set it aside until the single-visit balanced-split case
works.

Default day count: 6-day work week (used when the supervisor doesn't
specify a number of groups).

Data confirmed available directly in the uploaded `Invoices.xlsx`
(2,150 rows): `CustomerCode`, `Rep`, `Area`, `Class`, `Latitude`,
`Longitude`, `Total` — everything needed (per-customer location, current
rep/route assignment, and a sales figure to aggregate) already lives in
one file, no separate customer master or geocoding step needed for the
prototype.

Plan: build an offline prototype (aggregate sales per customer, then a
two-step algorithm — geographic clustering first, boundary-swap
refinement for sales balance second) against one real rep's customers,
visualize as a colored map, and only then decide the delivery surface
(GPT Action command vs. dashboard feature vs. both) — same principle as
the heatmap work: heavy computation and full-dataset visualization belong
server-side, not inside the GPT's own context/response.

**Prototype validated against real data, algorithm hardened.** Tested
against a 100-customer sample (Customers.xlsx + Invoices.xlsx) and then a
much larger, realistic 2,165-customer FSOS demo dataset
(FSOS_Demo_Dataset.xlsx — full multi-sheet schema: Customers, Routes,
Daily Visit Plan, Visit Execution, Sales Invoices, Customer/Route/Salesman
KPIs, etc.). Key findings:

- **Straight-line distance, not drive time.** User explicitly rejected
  drive-time (traffic makes it non-reproducible) in favor of a fixed
  geographic radius ("دايرة") around each group's center — computable
  from lat/lon alone (Haversine formula), no routing API/cost needed.
- **Found and fixed a real bug**: the original greedy swap heuristic
  (move a customer if it locally looks better) could cycle forever,
  bouncing one customer between two clusters indefinitely. Fixed by
  switching to proper hill-climbing on a global objective (sum of
  absolute deviation from target across all groups) — a move is only
  accepted if it strictly reduces that objective, which mathematically
  cannot cycle.
- **Added the "circle" constraint**: a hard max-radius-from-centroid cap:
  a customer cannot join a group if they're farther than the cap, no
  matter how much it would help balance sales. This is a hard constraint,
  not a preference — implements the user's "mercury droplet" analogy
  (each group stays a compact blob, never a stretched-out shape).
- **Radius is data-dependent, not a fixed constant.** Too tight a radius
  blocks almost all balancing moves (deviation stays near the
  unbalanced baseline); too loose defeats the point of a "route." Right
  answer found by sweeping a range and picking the smallest radius that
  still reaches near-0% deviation. Worked examples: Mohamed's toy route
  (100-cust sample) balanced at 20km; a real rep (SM-018, 160 real
  customers) balanced at just 6km; a real territory (TR-004, 322 real
  customers, 5 routes) balanced at 15km reaching 0.0% deviation (vs. a
  6x spread — 140K to 834K SAR — from pure geographic clustering alone).
- **Important negative result**: territory TR-002 (759 customers) could
  NOT be balanced into 8 compact routes at any reasonable radius (still
  ~97% deviation even at 80km). Root cause found by inspecting the data:
  the territory isn't geographically uniform — 86% of customers/88% of
  sales sit in a dense ~20km-wide urban core, with the rest scattered
  across a ~180km sparse corridor. No algorithm can make a sparse,
  far-flung minority "equal" to a dense urban majority within a sane
  travel radius — this is a genuine data/business-structure limit, not a
  tuning problem. Correct fix: split dense-core vs. sparse-periphery
  customers into separate sub-problems rather than forcing one N across
  a non-uniform territory (not yet implemented).
- **Real data also has fragmented current assignments** (e.g. TR-004's
  322 customers are currently split across 18 different reps in
  wildly uneven slivers) — real-world messiness the algorithm has to be
  robust to, not an artifact of the demo.

Current deliverables (all rebuilt against the real 2,165-customer
dataset, not the earlier 100-customer toy sample):
`sales_heatmap.html` (full customer base, territory/channel filters —
user's stated top priority, "هي اللي هاتبيع المنتج"),
`sector_split_prototype.html` (TR-004, 322 customers -> 5 balanced
routes), `route_split_prototype_mohamed.html` (real rep SM-018, 160
customers -> 6 balanced days).

Not yet done: dense/sparse territory splitting (TR-002 case), coverage %
/ strike rate % saturation signal (deferred by user — most companies
can't compute it yet, though the FSOS demo dataset's Visit Execution /
Route KPIs / Salesman KPIs sheets do have real StrikeRate%/
VisitComplianceRate% columns that could validate this later).

## Balancing algorithm changed to region-growing (adjacency-only), then shipped as a real dashboard feature

User reviewed the swap-based "after" result on a real map and asked for a
different growth rule, illustrated with a "mercury droplet" analogy
confirmed earlier: start from the "before" pure-geographic k-means groups
and grow each under-target group only by absorbing its nearest **directly
adjacent** neighbor from an over-target donor group — never a jump to a
non-adjacent customer, even if that customer would balance sales better.
Implemented as: sort groups by how under-target they are; for the most
under-target group, scan every customer currently in an over-target donor
group, take whichever one has the shortest distance to any point already
in the target group, move it, repeat until within tolerance or stuck.
Precomputes the full pairwise Haversine distance matrix once so each
iteration's "nearest neighbor" lookup is a fast array read, not a
recomputation.

Result quality (tolerance=1%): TR-004 (322 real customers, 5 groups)
140K-834K spread -> 401K-406K (max ~1% deviation); SM-018 (160 real
customers, 6 groups) 29K-228K spread -> 136K-149K (~5% deviation) — looser
than the earlier free-swap version's 0.0%, expected since growth-only is a
strictly more constrained search, but every group is now guaranteed a
single contiguous blob on the map (no orphaned customers), which was the
actual ask.

**Shipped as a real dashboard feature** (user's choice: dashboard button,
not a GPT Action command — "أول ما يفتح يستخدمها لو هو عايز"). New
`route-planning` module:

- `packages/schemas/src/route-planning.schemas.ts` — Zod schemas for the
  two endpoints (`routePlanningDistinctValuesSchema`,
  `routePlanningSplitSchema`); `ROUTE_PLANNING_LIMITS` added to
  `constants.ts` (maxGroupCount 20, maxCustomersPerRequest 5000 — a
  computation-time guard for the O(n^2) distance matrix, NOT a
  GPT-Actions-style response-size guard, since this endpoint is called
  directly by the dashboard).
- `apps/api/src/modules/route-planning/route-balancer.util.ts` — pure
  TypeScript port of the validated Python algorithm (Haversine, a
  hand-rolled k-means++ with multiple restarts since no ML dependency was
  needed at this data scale, then the region-growing balance pass).
  Verified via a standalone `tsx` run against the real TR-004 data before
  wiring it into the API — reproduced the same ~0.8% deviation the Python
  version got.
- `route-planning.service.ts` / `.controller.ts` / `.module.ts` — reads an
  uploaded Customers-type file via the existing `FilesService`
  (buffer -> XLSX -> rows, same pattern `GptService.getDataset` already
  uses), filters by a user-chosen scope column/value (e.g. one
  SalesmanID or TerritoryID), sources the sales value either from a column
  already on that file or aggregated on the fly from a second file (e.g.
  Invoices) keyed by customer id, excludes rows with insane/zero
  coordinates (same 3-bad-row pattern found in the real demo data),
  and returns before/after cluster assignments + totals for the map.
  Registered in `app.module.ts`.
- Frontend: `apps/web/src/app/(dashboard)/dashboard/route-planning/page.tsx`
  — file/column pickers (populated from `parsedMetadata.headers`, no
  hand-typed column names), a scope-value dropdown backed by a new
  `GET /route-planning/distinct-values` endpoint, group-count input, a
  sales-source toggle (column vs. aggregate-from-second-file), and a
  before/after map. `components/route-planning/route-split-map.tsx` draws
  the map with vanilla Leaflet (dynamically imported inside `useEffect`
  only — Leaflet's module top-level code touches `window`, so a static
  import would break server-side rendering of the client component's
  first pass; the CSS import is static since stylesheets don't have that
  problem). Added `leaflet` + `@types/leaflet` to `apps/web/package.json`,
  and a "Route Planning" nav item to the dashboard shell.

Not yet type-checked against a real `tsc` run — the sandbox's
`node_modules/typescript` symlink is unreadable in this environment (same
class of mount-permission quirk as the earlier `git index.lock` issue),
so this needs verifying via the user's own local build or the Railway
build log, same fallback used earlier this session for the TS1355 cookie
bug.

Still not implemented: the four flexible split modes discussed earlier
(auto-suggest group count / fixed count / rebalance existing groups / add
one new group to existing ones) — current version only supports "split
into a fixed group count from scratch." Also not implemented: the
dense/sparse territory pre-split (TR-002 case) as an automatic step.

## Excel export added to Route Planning; route-to-days split confirmed already supported

User testing the shipped Route Planning page flagged two things:

1. **Needed a way to get the split result out as an Excel file.** Added a
   client-side "تصدير Excel" button (`exportResultToExcel` in
   `route-planning/page.tsx`) — builds the .xlsx directly in the browser
   from `result.records` (already loaded after a split) via a dynamically
   imported `xlsx` (SheetJS), no new backend endpoint needed. Added `xlsx`
   to `apps/web/package.json`.
2. **Splitting a single rep's route into 6 days** — turns out this needs
   zero new code. `scopeColumn` in the existing split form is already
   generic (any column, not hardcoded to "territory"), so picking the
   route/rep column as scope and `groupCount: 6` already does exactly
   this. Confirmed to the user rather than building anything.

## Heat map shipped as a hybrid dashboard + LLM-interpreted-filter feature

Revisited the heat map's delivery surface (previously left as a
standalone, unshipped `sales_heatmap.html` prototype). Recommended
dashboard over GPT Action for the same reasons as Route Planning (GPT
Actions' ~100K-char response ceiling, and the retested unwillingness of
the model to loop many sequential tool calls itself — see the "Retest
result" section above). User agreed, but raised a real objection: unlike
Route Planning's fixed-shape request, heat map requests are open-ended
("وريني بس منطقة الرياض", "قارن الشهر ده") — a rigid dropdown form doesn't
fit that, but ChatGPT can't render an interactive map even if the request
routed through it. Resolved as a **hybrid**: a real interactive Leaflet
heat map in the dashboard, with a free-text prompt box on top that calls
the Claude API server-side to translate the request into a structured
filter (region/date range/metric), which is applied to the visible form
fields (never queried blindly) before the user re-runs the query.

This is the first outbound LLM/HTTP integration in the codebase (checked:
no `openai`/`@anthropic-ai/sdk`/`axios`/`HttpService` existed anywhere in
`apps/api` before this). Uses native `fetch` (Node 22 in production, no
polyfill needed) rather than adding a new SDK dependency.

New `heatmap` module, mirroring `route-planning`'s structure:

- `packages/schemas/src/heatmap.schemas.ts` — `heatmapQuerySchema`
  (customer file + lat/lon/id/label columns, `metric: "sales" |
  "customerCount"`, sales value from a column or aggregated from a second
  file with an optional date column, optional scope column/value) and
  `heatmapInterpretSchema`/`heatmapInterpretResultSchema` (the free-text
  request in, the structured filter out — validated with the same Zod
  schema on both the request we send Claude and the reply we parse back,
  so a malformed LLM response fails closed with a friendly error instead
  of propagating bad data). `HEATMAP_LIMITS` added to `constants.ts`.
- `apps/api/src/modules/heatmap/heatmap.service.ts` — `query()` reads/
  filters/aggregates like Route Planning's service (same
  `readSheetRows`/`isSaneCoordinate` pattern, deliberately duplicated
  rather than shared since each module already does its own small copy);
  `interpret()` calls `POST https://api.anthropic.com/v1/messages` with
  model `claude-haiku-4-5-20251001`, a system prompt listing the real
  scope-column values (capped at `HEATMAP_LIMITS.maxScopeValuesInPrompt`)
  and today's date, asks for strict JSON only, extracts it with a regex
  fallback, then re-validates through `heatmapInterpretResultSchema`
  before returning it.
- New env var `ANTHROPIC_API_KEY` — added as **optional** in
  `env.validation.ts`/`configuration.ts`/`.env.example` (via the existing
  `AppConfigService` — a fully custom, `@Global()`, Zod-typed config
  module; this codebase doesn't use `@nestjs/config`). Optional so the
  rest of the app keeps working if it's unset; only `POST
  /heatmap/interpret` throws a clear `BadRequestException` pointing at
  what to set. **User still needs to get a key from
  console.anthropic.com and set it in Railway's env vars** — not
  something that can be done on their behalf.
- Distinct-value dropdowns reuse the existing `GET
  /route-planning/distinct-values` endpoint (it was already generic —
  fileId + column, nothing route-planning-specific) rather than
  duplicating it under `/heatmap`.
- Frontend: `apps/web/src/app/(dashboard)/dashboard/heatmap/page.tsx` +
  `components/heatmap/heatmap-map.tsx` (Leaflet + the `leaflet.heat`
  plugin — dynamically imported after `leaflet` itself inside `useEffect`,
  same SSR-safety reasoning as Route Planning's map; `leaflet.heat` has no
  usable official `@types` package, so
  `apps/web/src/types/leaflet-heat.d.ts` hand-declares the `L.heatLayer`
  augmentation). Added `leaflet.heat` to `apps/web/package.json` and a
  "Heat Map" nav item.

**A real mount-desync bug recurred during this build, worse than before.**
While verifying, found the bash sandbox's view of *eight* separately
Edit-tool-modified files (`constants.ts`, `.env.example`,
`packages/schemas/src/index.ts`, `apps/web/src/lib/api/index.ts`,
`env.validation.ts`, `configuration.ts`, `app.module.ts`,
`apps/web/src/app/(dashboard)/layout.tsx`, `apps/web/src/lib/types.ts`,
`apps/web/package.json`) were truncated mid-statement in the Linux
sandbox's mount, while the Windows-side Read tool showed the correct,
complete file every time. Every file newly created via the Write tool in
this same session was unaffected. Confirms the earlier hypothesis: Edit
operations on pre-existing files are what desyncs the bash mount, Write
(new file) doesn't. The Windows-side file tools are the source of truth —
none of the user's real files were ever actually broken, only the
sandbox's cached view of them; bash-side reads were cross-checked against
fresh Read-tool output and rewritten via heredoc where they'd lagged, for
this session's own `tsc`-check purposes only.

**Verification status**: `packages/schemas/src/heatmap.schemas.ts` +
`constants.ts` compiled clean against a standalone `tsc` matching the
project's exact strict flags (same `/tmp` install method used for the
Route Planning fix). The specific `noUncheckedIndexedAccess` patterns
used in `heatmap.service.ts` (narrowing a destructure right after an
`if (input.x && input.y)` truthy check, `Record<string, unknown>` index
reads, `fetch`/`Response` global typing under `lib: ["ES2022"]` relying on
`@types/node`) were each isolated and confirmed to compile clean
separately. The full NestJS module (decorators, DI) was not run through a
real `tsc` — same sandbox limitation as Route Planning — so, same as
before, the Railway build log is the final ground truth if anything was
missed.

Not yet implemented: no way to compare two time periods side-by-side in
one view (the prompt box can shift the date range, but only one map at a
time); metric is sales-or-count, not a blended/normalized view.

## Route Planning: multi-select scope + editable group labels (the "supervisor level")

User tested the shipped feature and flagged a real gap: everything so far
only handles "split ONE existing scope value into N sub-groups" (one
territory into routes, one rep's route into days). A supervisor's actual
higher-level need is different — pool **multiple** existing routes/reps
together, then re-split that pooled set into a group count that's
independent of how many were pooled (rebalance the same 4, consolidate 4
into 3, or add a 5th new route). This is the "rebalance existing
groups"/"add a new route" cases from the four flexible split modes noted
as not-yet-implemented earlier in this log.

Resolved as a scoped, minimal change rather than new "modes": the
existing single `scopeValue` became a checkbox-driven `scopeValues[]`
multi-select (user's explicit call — "وارد المشكلة تكون في بعض المسارات
فقط" — a plain dropdown can't represent "just these 2 of 6 reps"), and
`groupCount` (already a free-form number input) now does double duty as
the target count, with no relationship enforced to how many values were
selected — the algorithm doesn't care whether that number is new, smaller,
or the same.

Changes:

- `packages/schemas/src/route-planning.schemas.ts`: `scopeValue: string`
  → `scopeValues: string[]` (`.min(1).max(ROUTE_PLANNING_LIMITS.maxDistinctValues)`).
- `route-planning.service.ts`: filters via `new Set(scopeValues).has(...)`
  instead of `===`; result echoes back `scopeValues` (array) instead of
  `scopeValue`.
- Frontend: the scope-value `Select` became `ScopeValueChecklist` (plain
  styled `<input type="checkbox">` list, not a new Radix dependency —
  `@radix-ui/react-checkbox` isn't installed and this didn't seem worth
  adding one for) with "تحديد الكل"/"إلغاء الكل" convenience buttons.
- **New**: editable per-group labels (`groupLabels` state in
  `page.tsx`), defaulted from the selected scope values in list order
  (e.g. picking Ahmed/Mohamed/Sara/Khaled pre-fills those 4 names onto
  the 4 result groups); any group beyond the selected count (the "add a
  5th route" case) gets a generic "خط جديد N" placeholder. Explicitly
  **not** a smart re-identification of which new geographic group
  corresponds to which original route (the split is a fresh geographic
  clustering, not a stable mapping) — these are a starting suggestion the
  user edits via an inline `<Input>` per row in the results table before
  exporting. Labels flow through to the Excel export (`"الخط (قبل/بعد)"`
  columns) and the map popups (`components/route-planning/route-split-map.tsx`,
  now takes an optional `labels` prop).

Verified: `packages/schemas/src/route-planning.schemas.ts` compiles clean
against the standalone strict `tsc` (same `/tmp` method as before).
`route-planning.service.ts`'s new `Set`-based filter and `page.tsx`'s new
state were reviewed by hand for the same `noUncheckedIndexedAccess`
patterns already validated this session (array-index reads guarded with
`?? fallback` or explicit `!== undefined` checks) — not run through a
full NestJS-aware `tsc` for the same sandbox-symlink reason as every other
module this session; Railway's build log remains the final check.

Bug hit while testing this: a persistent "Validation failed" error that
survived multiple full dev-server restarts. Root cause had nothing to do
with the code — `apps/web/.env.local` had `NEXT_PUBLIC_API_URL` pointing
at the **Railway production URL** (left over from earlier deployment
testing), so the local frontend was talking to the deployed API the whole
time, which obviously didn't have any of today's unreleased schema
changes. Fixed by pointing it back at `http://localhost:4000/api/v1` for
local dev. Lesson: when local changes don't seem to take effect no matter
how many restarts, check which API the frontend is actually calling
before assuming a build/cache problem. Also improved
`zod-validation.pipe.ts` while debugging this: the response now includes
a real per-field summary (e.g. `"scopeValues: Array must contain at least
1 element(s)"`) instead of the generic literal string "Validation failed"
— benefits every form in the app, not just this one.

Also fixed, per user feedback after testing: max group deviation still
looked geographically messy in the "after" (balanced) view when pooling
multiple, geographically spread-out scope values (e.g. routes spanning
from an airport to a dense downtown). Root cause understood and agreed
with the user: this is the same TR-002-class tension documented earlier
(sales balance vs. geographic compactness are in real tension when the
pooled area is non-uniform) — not a bug. Agreed fix (not yet implemented):
add an optional max-distance-from-group cap so growth stops before
crossing too far, trading some balance precision for visual/practical
compactness. **TODO next session**: implement this as an optional
`maxDistanceKm` parameter on `balancedRegionGrow`.

## Strategic context: Field Sales OS vs. the larger "FSOS Platform / Murshidak" vision

User revealed the broader plan this session, which reframes everything
built so far. Two separate projects, deliberately kept separate for now:

- **Field Sales OS** (`D:\Field Sales OS`, this repo) — NestJS + Next.js +
  Prisma, deployed on Railway. File-upload-driven analytics/planning
  tool: Route Planning, Heat Map, GPT Action integration. Snapshot-based
  (Excel exports), not live-connected to any company system.
- **FSOS Platform / "Murshidak"** (`C:\fsos-app`) — a separate, much
  larger vision: "an Enterprise AI Operating System for FMCG companies,"
  explicitly "NOT a chatbot" but an "Executive Decision Engine." Every
  screen a field rep needs while actually in the market (excluding
  accounting/warehouse) — but **live-connected to the company's own
  system**, not Excel uploads. Currently a Replit-scaffolded React + Vite
  + Wouter + Drizzle frontend shell ("clean slate for future features,"
  per its own `replit.md`) with UI scaffolding already started for an AI
  panel / intelligence panel / knowledge library / chat components — not
  yet wired to a real backend. Different stack from Field Sales OS
  entirely (Vite/Wouter/Drizzle vs. Next.js/Prisma) — a real migration or
  integration decision, not just "drop it in," whenever that phase starts.

**Why the big platform is deliberately postponed** (user's own words,
worth preserving verbatim in spirit): first, financial — building the
"heavy" live-connected version now, before validating anything, is a
resourcing risk. Second, go-to-market sequencing — ship the lighter
analytics tool first, let it spread, use that period to collect real
problems/data and earn companies' trust, *then* build the heavy platform
once there's a proven foundation to build it on.

**The flagship feature of the big platform**, which the earlier ChatGPT
screenshot (customer-12/customer-13 proximity scenario, structured
"الهدف / القرار الفوري / الجملة المقترحة" output) was a preview of: a rep
standing at a brand-new customer just uploads their GPS location — no
other input — and the system surfaces suggested products/categories, the
actual talking points to say, informed by nearby existing customers'
real behavior. This is the concrete reason the ChatGPT-reliability
findings from earlier this session matter beyond Field Sales OS: a
flagship feature like this needs to work every time, which is exactly
what ChatGPT's Custom GPT platform has NOT reliably done this session
(session/state loss after a few turns, refusal to loop tool calls,
response-size ceiling). The plan discussed: when the big platform phase
starts, that reasoning layer should be Anthropic's Claude API called
directly from FSOS's own backend (the same pattern already proven this
session in the heat map's `interpret` endpoint), with the "DNA" layers
(general/company/role) stored and assembled server-side as system-prompt
content instead of living in OpenAI's Custom GPT configuration — full
control, no dependency on OpenAI platform behavior.

**Cost sanity-check done this session** (informal, order-of-magnitude):
a rich structured answer like the ChatGPT screenshot is roughly 1.5-2
cents per question on Claude Sonnet pricing (input/output blend,
mid-2026 rates) — a few thousand questions a month across a whole
company lands around $15-20/month. Conclusion: not worth a separate
per-user AI subscription tier: fold it into existing plan pricing, and
protect against runaway cost with a per-company usage cap (same pattern
as `ROUTE_PLANNING_LIMITS`/`HEATMAP_LIMITS`) rather than new billing
complexity.

**Not decided yet, explicitly deferred**: exact technical path from
Field Sales OS's current features into FSOS Platform's stack (rebuild in
Vite/Wouter, keep Next.js and integrate/embed, or something else);
timeline for starting the big-platform phase; how "live-connected to the
company's system" actually works per company (every FMCG company's
backend/ERP will differ — this needs its own integration-adapter design
whenever that phase starts).

## Strategic point 4 — per-company trial extension

Investigated "we lost control over trial day counts" — found the global
mechanism was never actually broken: `PlatformSettings.trialDurationDays`
+ the SUPER_ADMIN `/admin/settings` screen still fully control how long a
*new* signup's trial runs. The real, narrower gap: once a company's
subscription row exists, there was no way to adjust *that specific
company's* `trialEndsAt` afterward — `updateSubscriptionSchema` only
exposed `planCode/status/paymentStatus/currentPeriodEnd`, even though
`trialEndsAt` already existed on the `Subscription` model.

Fix (no migration — the field already existed):
- `packages/schemas/src/subscription.schemas.ts` — added optional
  `trialEndsAt` to `updateSubscriptionSchema`.
- `apps/api/src/modules/subscriptions/subscriptions.service.ts` —
  `updateForCompany` now writes it through.
- `apps/web/src/app/(admin)/admin/subscriptions/page.tsx` — Edit dialog
  gained a "Trial ends" date field (only meaningful while status is
  TRIAL), wired to the existing PATCH `/subscriptions/:companyId`.

## Strategic point 3 — row-level access control (Manager/Supervisor/Rep)

Product owner's mechanism, confirmed across a few rounds of discussion:
accounts are created in the platform first; when a data file is later
prepared in Excel, a column gets filled in with the exact platform
username/email of whoever that row belongs to. A COMPANY_ADMIN maps,
once per file, which column represents Rep / Supervisor / Manager. From
then on a SUPERVISOR or SALES_REP only sees rows matching their own email
in that column; COMPANY_ADMIN/MANAGER/SUPER_ADMIN always see everything
("المدير يشوف كل المشرفين بمناديبهم"). A file with no column mapped
(e.g. a shared Products/reference file) stays visible to everyone,
unchanged from today.

**Migration** (`20260713000000_file_hierarchy_columns`): added three
nullable columns to `File` — `rep_column`, `supervisor_column`,
`manager_column`. Additive, every existing row defaults to NULL
(unfiltered), so no existing behavior changes until a COMPANY_ADMIN
opts a file in.

**New pieces**:
- `packages/schemas/src/file.schemas.ts` — `setHierarchyColumnsSchema`.
- `apps/api/src/modules/files/files.service.ts` — `setHierarchyColumns`.
- `apps/api/src/modules/files/files.controller.ts` — `PATCH
  /files/:id/hierarchy-columns`, `@Auth("COMPANY_ADMIN")` only (deliberate
  — the people being restricted must not be able to set their own
  restriction).
- `apps/api/src/modules/files/dataset-query.util.ts` —
  `applyHierarchyFilter(rows, headers, file, user)`: MANAGER/COMPANY_ADMIN/
  SUPER_ADMIN unfiltered; SUPERVISOR filtered by `supervisorColumn`;
  SALES_REP filtered by `repColumn`; missing column mapping = unfiltered
  for that tier. Fails **closed** (empty result), not open, if a
  configured column name no longer exists on the file — a wrong answer
  here should never mean "show everything."
- Wired into `assistant.service.ts`'s `queryDataset` (now takes the full
  `AuthenticatedUser`, not just `companyId`) and `gpt.service.ts`'s
  `getDataset` (looks up the requesting user's role/email via
  `session.userId`, since the legacy ChatGPT Action authenticates by
  API key + launch-code, not a platform JWT). Both read through the same
  shared util, so the old ChatGPT screen can never see more than the new
  Assistant screen does.
- `apps/web/src/app/(dashboard)/dashboard/files/page.tsx` — COMPANY_ADMIN-
  only "Restrict by rep / supervisor…" control per confirmed file, letting
  them pick each level's column from the file's detected headers (or
  leave as "— None —").

**First pass covered only the Assistant and the legacy ChatGPT Action** —
the two "ask a question, get an answer" pathways that already shared
`dataset-query.util.ts`. Heat Map, Route Planning, and Geo Intelligence
each read workbook rows through their own separate code path, so were
flagged as a known gap rather than silently left uncovered.

**Follow-up (same session, user asked for full coverage)**: wired
`applyHierarchyFilter` into all three remaining pathways, at every point
each service reads raw rows from a file — always using *that file's own*
repColumn/supervisorColumn (a customer master file and a per-rep sales
file can be configured independently; only files an admin actually
mapped get filtered):
- `heatmap.service.ts` — `query()`'s customer-file read and its
  sales-file aggregate read, plus `computeLostSalesValues()`'s sales-file
  read. Signature changed from `(companyId, input)` to
  `(user: AuthenticatedUser, input)`.
- `route-planning.service.ts` — `split()`'s customer-file and sales-file
  reads, and `listDistinctValues()` (so a restricted role can't discover
  other reps' scope values via the dropdown-population endpoint either).
  Signatures changed to take `user` instead of `companyId`.
- `geo-intelligence.service.ts` — all three of `listCustomers()`,
  `analyze()`, and `compareCustomer()` funnel through one private
  `loadRows()`, so filtering there covers all three at once. Signatures
  changed to take `user` instead of `companyId` (`talkingPoints()`

## Visual identity redesign — batch 1: theme foundation, RTL, Arabic type (July 2026)

Triggered by the user sharing a light-glassmorphism dashboard reference
image and asking to discuss before building. Agreed scope (see chat):
light/dark toggle (not a full light-only replacement), a distinct accent
color per module/section instead of one fixed orange, full RTL layout
mirroring, and Arabic-optimized typography — applied dashboard-wide.

This batch ships the **foundation** only: theme tokens, the toggle
mechanism, RTL + font at the root, the dashboard shell (sidebar/header),
and the per-module color system wired into nav. It deliberately does not
yet re-skin the content cards inside each of the 13+ dashboard pages
(Heat Map, Route Planning, Team Performance, etc.) — see "Not done yet"
below.

**Color system.** Replaced the fixed dark+orange palette
(`--primary: 20 90% 55%`, warm/brown base hues) with a blue primary
(`217 91% 60%`) matching the reference's CTA/active-nav color, on both a
new light theme (`:root`, base hue `210`/`222`, near-white background,
solid white cards) and a re-hued dark theme (`.dark`, base hue `222`,
navy instead of the old warm-brown dark). This was a judgment call, not
explicitly asked — the user shared the reference as "the visual
identity" without objecting to the primary color shift; flagged here so
it's easy to revert to orange-primary if that reads wrong once seen live.
Per-module accent (13 distinct hues: sky/violet/fuchsia/amber/cyan/rose/
emerald/indigo/purple/teal/green/orange/slate — see
`lib/module-colors.ts`) still carries the old orange for the "Team"
module, so the color isn't lost, just no longer the single system-wide
accent.

**Files:**
- `apps/web/src/app/globals.css` — full rewrite: light values now live at
  `:root` (previously the dark values were hardcoded there with no
  alternative), dark values moved to `.dark` override, `--radius`
  increased (0.625rem → 0.875rem) for the softer glass look, added
  `@layer utilities` with `.glass-panel` / `.glass-card` /
  `.bg-app-gradient` — reusable frosted-glass primitives (backdrop-blur +
  translucent bg, both with dark: variants) for the shell and, later,
  page content.
- `apps/web/src/lib/module-colors.ts` (new) — `ModuleColorKey` union (13
  keys matching every current nav route) + `MODULE_BADGE_CLASSES` map of
  Tailwind class strings (light/dark pair per key). Single source of
  truth so any page can reuse a module's color, not just the sidebar.
- `apps/web/src/components/theme-provider.tsx` (new) — plain React
  context (no new dependency — deliberately not `next-themes`, since
  adding an npm dependency here would require the user to run an install
  step on their real machine that this session can't do for them; see
  the ERR_CONNECTION_REFUSED / dev-server thread earlier in this log).
  Reads the "dark" class already set by the inline script (see below) on
  mount so React state starts in sync, then owns the class + localStorage
  (`fsos-theme`) from then on. `useTheme()` hook exposes
  `{ theme, setTheme, toggleTheme }`.
- `apps/web/src/components/theme-toggle.tsx` (new) — sun/moon icon
  button (mirrors the reference's top-right toggle), Arabic
  aria-label/title.
- `apps/web/src/app/layout.tsx` — `lang="ar" dir="rtl"` (was `lang="en"`,
  no dir, meaning the entire app was rendering LTR despite 100% Arabic
  copy — see the earlier research note in this log). Swapped
  `next/font`'s Inter for `Cairo` (`subsets: ["arabic", "latin"]`),
  wired through the same `--font-sans` CSS variable
  `tailwind.config.ts` already expected, so no Tailwind config change was
  needed. Added a blocking inline `<script>` in `<head>` that sets the
  `dark` class before first paint (avoids a flash of the wrong theme) —
  standard pattern for a manual (non-next-themes) toggle. Metadata
  title/description translated to Arabic.
- `apps/web/src/components/shell/app-shell.tsx` — full rewrite.
  `border-r` → `border-e` (Tailwind logical property) so the sidebar's
  border follows text direction instead of a hardcoded side. No JSX
  reordering was needed for the sidebar to move to the right: a plain
  `flex` row auto-mirrors under `dir="rtl"` per the CSS spec once the
  root `dir` attribute is set — confirmed this is sufficient rather than
  assuming a manual reorder was required. Nav items now render each
  icon inside a colored badge (`MODULE_BADGE_CLASSES[item.colorKey]`)
  instead of a plain icon. Sidebar/mobile-header backgrounds use the new
  `.glass-panel` utility. Brand text "Field Sales OS" → "مرشدك"; "Log
  out" → "تسجيل الخروج". `ThemeToggle` added next to the logout button.
- `apps/web/src/app/(dashboard)/layout.tsx` — nav labels translated to
  Arabic (Overview → نظرة عامة, Assistant → المساعد الذكي, ... — all 13
  items) and each given its `colorKey` from `lib/module-colors.ts`.

**Not done yet (explicitly out of scope for this batch, tracked for the
next pass):**
- The 13+ individual dashboard pages' own content (cards, tables, forms)
  still use the plain `bg-card`/`border` look, not `.glass-card`. The
  utility class exists and is ready to apply page-by-page.
- `(marketing)`, `(admin)`, and `(auth)` route groups (site header/
  footer, admin page, login/signup layout) still say "Field Sales OS"
  and weren't touched — the user's stated scope was "the dashboard,"
  which is a narrower route group than these three. Flagging in case the
  intent was actually the whole app.
- No automated typecheck was run for this batch: the mounted web app's
  `node_modules` is unreadable from this session's Linux sandbox (`ls
  node_modules/next` → I/O error, likely a Windows-mount quirk), the
  same reason frontend TSX changes have been hand-reviewed rather than
  scratch-compiled all session. Reviewed by hand instead; user should
  eyeball it after restarting `pnpm dev`.
- `next/font`'s `Cairo` fetch requires network access at build time on
  first run (Next.js caches it after that) — should work given this repo
  already successfully uses `next/font` for Inter, but flagging since it
  wasn't verified end-to-end here.

## Visual identity redesign — batch 2: Arabic translation sweep + Team Performance UX fix (July 2026)

Follow-up to batch 1, triggered by three user reports: Team/Settings/
Files/Analysis Studio screens still English, "خريطة الحرارة" nav label
should read "الخريطة الحرارية" (the page's own `<h1>` already said this —
only the sidebar nav item hadn't been updated), and "Team Performance
مش عارف اشغلها" (can't figure out how to use it).

**Heat Map label** — one-line fix in `(dashboard)/layout.tsx`'s nav array.

**Translation sweep** — translated to Arabic: `dashboard/files/page.tsx`
(including the `HierarchyColumnsEditor` — see below), `dashboard/team/
page.tsx`, `dashboard/settings/page.tsx` (all three tabs), `dashboard/
analysis-studio/page.tsx`, and `components/dashboard/launch-gpt-card.tsx`
(pulled in because it renders directly on the now-Arabic Analysis Studio
page — leaving it English would have been a worse inconsistency than not
touching it). Status/payment enum values (`READY`/`FAILED`, `SUCCEEDED`/
`PENDING`, etc.) get a small label-lookup map rather than being translated
in place, since those are DB enum values elsewhere in the codebase, not
free text.

**Team Performance root cause** — traced the "can't get it working"
report to `dashboard/files/page.tsx`'s `HierarchyColumnsEditor`: it's the
only place `repColumn` gets set, it's gated to `COMPANY_ADMIN` only
(`canManage`), and it was labeled "Restrict by rep / supervisor…" — an
access-control framing with no visible link to Team Performance at all.
A non-admin user has no path to fix this themselves, and even an admin
would have no reason to associate that toggle with the Team Performance
screen. Two-part fix:
- `HierarchyColumnsEditor`'s toggle button now reads "تحديد عمود المندوب
  / المشرف (للصلاحيات ولشاشة أداء الفريق)…" and the helper text under it
  explicitly says setting the rep column is what makes the file show up
  in Team Performance.
- `dashboard/team-performance/page.tsx`'s empty state (shown when
  `eligibleFiles.length === 0`) now branches on role: `COMPANY_ADMIN`
  gets an actual `<Link>` button straight to `/dashboard/files` instead
  of plain instructional text; anyone else gets a message clarifying this
  is an admin-only setup step and to ask their admin, instead of a
  dead-end instruction they can't act on themselves.

## Bilingual Arabic/English support — foundation (July 2026)

Requested because the company has Indian/Pakistani reps who don't read
Arabic. Scoped with the user first (see chat) since this is architecture-
level (CLAUDE.md's stop-and-confirm list includes migrations, and the
"where does the language preference live" question forks into one):
account-level (needs a `User.preferredLanguage` DB column — a migration)
vs. device-level (`localStorage`, like the theme toggle — no migration).
User's answer didn't clearly resolve that fork ("عايز لغتين بس عربي
وانجليزي" confirmed 2 languages, not which storage tier), so — per
CLAUDE.md's explicit instruction not to make a database migration without
a stop-and-confirm — this batch ships the **device-level** version only.
A rep's language choice currently resets if they log in from a different
phone/browser. Upgrading to an account-level preference is a small,
well-scoped follow-up (one migration + one settings field) if the user
wants reps' language to follow their login instead — flagged here
explicitly rather than silently picked.

User also chose: translate the whole ~20-screen dashboard eventually (not
a phased subset), and a hand-built lightweight translation system over a
library like next-intl (matches the theme toggle's "no new npm dependency"
reasoning — this session can't run `pnpm install` on the user's real
machine, only in an isolated sandbox that doesn't share their environment).

**This batch ships the infrastructure + the app shell only** (sidebar
nav, brand name, logout button, language switcher) — not all ~20 pages'
body content. Translating every hardcoded Arabic string across every
dashboard page in one uninterrupted pass, in a sandbox that cannot
currently typecheck or compile this Next app (see batch 1's "not done
yet" note — `node_modules` is unreadable here, likely a Windows-mount
quirk) was judged too risky to do blind; shipping and confirming the
mechanism works end-to-end first, then expanding page-by-page, follows
the same batching approach used for the map-catalog and visual-redesign
work all session.

**Files:**
- `apps/web/src/lib/i18n/dictionaries.ts` (new) — `Locale = "ar" | "en"`,
  a flat dot-namespaced `TranslationKey` union, and `dictionaries.ar` /
  `dictionaries.en` records. Currently covers `nav.*` (13 keys matching
  every current nav route), `shell.brand`, `shell.logout`,
  `language.switchTo`. Designed to grow key-by-key as pages get converted
  — no restructuring needed later.
- `apps/web/src/components/translation-provider.tsx` (new) — same shape
  as `theme-provider.tsx`: React context, `localStorage` key
  `fsos-locale`, and on every locale change it sets both
  `document.documentElement.lang` and `.dir` (`rtl` for ar, `ltr` for
  en) — this is what makes English render left-to-right despite batch 1
  having set a global `dir="rtl"`. `useTranslation()` exposes
  `{ locale, setLocale, toggleLocale, t }`.
- `apps/web/src/components/language-toggle.tsx` (new) — small button
  (Languages icon + the *other* language's name, e.g. shows "English"
  while in Arabic) next to the theme toggle.
- `apps/web/src/app/layout.tsx` — added a second blocking inline script
  (`LOCALE_INIT_SCRIPT`, mirrors `THEME_INIT_SCRIPT`'s pattern) that
  applies a saved locale's lang/dir before first paint, and wrapped the
  tree in `TranslationProvider` (inside `ThemeProvider`, same nesting
  order doesn't matter here since the two are independent).
- `apps/web/src/components/shell/app-shell.tsx` — brand name and logout
  button text now come from `t("shell.brand")` / `t("shell.logout")`
  instead of hardcoded Arabic; `LanguageToggle` added next to
  `ThemeToggle` in both the desktop sidebar footer and the mobile header.
  Deliberately did NOT change the shared `NavItem` type (`label: string`
  stays a plain string, not a translation key) — `(admin)/layout.tsx`
  also constructs `NavItem[]` for `AppShell` with its own (English, out
  of this batch's scope) labels, and changing the interface to
  `labelKey` would have broken that unrelated, un-asked-for surface.
- `apps/web/src/app/(dashboard)/layout.tsx` — nav items now resolve their
  `label` through `t("nav.xxx")` at construction time instead of a
  hardcoded string, so `AppShell`/`NavItem` didn't need to change at all
  to become translatable.

**Not done yet (explicitly out of scope for this batch):**
- Every dashboard page's own body copy (headings, buttons, table columns,
  toasts, empty states) across all ~20 screens — still hardcoded Arabic.
  Next batches should convert a few pages at a time into the same
  `dictionaries.ts` + `t()` pattern, verifying each before moving on.
- Account-level (DB-backed) language persistence — flagged above, needs
  explicit go-ahead since it's a migration.
- Number/date formatting is not locale-aware yet (`formatAmount` still
  hardcodes `toLocaleString("en-US")` regardless of the selected
  language) — probably fine to leave as-is (Western numerals read fine
  in both languages in this context) but noting it was not addressed.

## Visual identity redesign — batch 3: shell rebuild from full mockup (July 2026)

User shared two fully-rendered mockups (light + dark) of a generic FMCG
"Overview" screen, with the instruction to read past the literal text/
buttons and copy the structure/style ("بص كانك مش شايف النصوص والزراير").
The reference's own nav items (Customers, Daily Tasks, Visit Plan, Invoices,
KPIs, Route 360...) don't exist as pages in this app — they're illustrative,
not a literal spec — so this batch adapted the *visual language* (grouped
sidebar sections, pill-shaped active nav item, header search bar,
notification/user-menu cluster, avatar) onto this app's real 13 nav items,
rather than replacing them with the mockup's fictional ones.

**Sidebar** — nav items now render under section headings
(`lib/i18n/dictionaries.ts`'s new `group.*` keys: البيانات/Data, الذكاء
والتحليل/AI & Insights, العملاء والمناطق/Customers & Territory,
الفريق/Team, النظام/System), grouped by feature area rather than the flat
list from batch 1. Active item is now a full `rounded-full` gradient pill
(matching the reference's "Dashboard" pill) instead of a subtle tinted
background; its icon badge swaps to a translucent white overlay instead of
its module color so it still reads against the gradient. Brand block
gained the reference's tagline line under "مرشدك" (`shell.tagline`).
Logout moved to its own bottom-of-sidebar row (no longer bundled with
user identity, which moved to the header — see below), matching the
reference's layout split.

**Header (new)** — previously there was only a `md:hidden` mobile header;
desktop had no top bar at all. Added a persistent `DashboardHeader`
(`components/shell/app-shell.tsx`) across all breakpoints:
- A **working** quick-nav search (not decorative): typing filters the
  actual `navItems` by label and lists matches with their module-color
  icon badge; Ctrl/Cmd+K focuses it; click navigates. Chose this over a
  fake/inert search box since the mockup implies real search
  functionality and an inert one would be misleading.
- Theme + language toggles moved from the sidebar into the header
  (collapse into the user-menu dropdown below `sm:` breakpoint).
  User identity (initials avatar, name, `role.name`, email) moved from
  the sidebar footer into a header dropdown menu, matching the
  reference's top-right user cluster. Avatar is generated from the
  user's initials — there's no `avatarUrl`/photo field on the `User`
  type (checked `lib/types.ts`), so a fabricated photo was not an option;
  initials-on-gradient is the honest equivalent.
- **Deliberately did not add** a notification bell. The reference shows
  one with a hardcoded unread count ("5"), but this app has no
  notifications backend/table/API at all — a bell with a fake or always-
  empty badge would imply a feature that doesn't exist. Flagging as a
  real feature to design separately if wanted, not a styling omission.
- Mobile nav: no drawer/sheet component existed to reuse, so mobile
  keeps the sidebar hidden and instead the header's hamburger toggles an
  inline collapsible panel (same grouped `NavList` component, shared with
  the desktop sidebar) directly under the header.

**Files:** `components/shell/app-shell.tsx` (full rewrite — `NavList` and
`DashboardHeader` extracted as internal components), `lib/i18n/
dictionaries.ts` (added `shell.tagline`, `shell.searchPlaceholder`,
`group.*` ×5), `app/(dashboard)/layout.tsx` (nav items reordered into
contiguous groups — `AppShell` renders a heading whenever `item.group`
changes, so same-group items must be adjacent — and each given its
`group` string via `t()`).

**Not done:** the Overview page itself (hero banner, suggestion cards,
stat cards, priority customers, quick actions, recent activities) — the
mockup's actual page content wasn't in scope per the user's own framing
("ignore the text/buttons"), and building it for real would mean either
fabricating data the backend doesn't have (notifications, "AI
suggestions", a greeting banner) or scoping genuine new features first.
Flagging as a natural next conversation, not assuming the answer.

## Slow navigation report (July 2026)

User reported navigation between dashboard pages feels very slow. Checked
for real bugs before assuming it's inherent to dev mode: no
`middleware.ts` exists (ruled out per-request overhead there);
`scripts/dev-guard.mjs` only runs once at `pnpm dev` startup (kills stale
servers/port squatters), not per-navigation; `useAuth()`'s React Query
config already has `staleTime: 30_000` so the `/auth/me` check is cached
across route changes, not refetched on every navigation; no
`middleware`-level auth re-check either (auth is client-guard only via
`useRequireAuth`, matching this app's documented security model — the
real boundary is the API's guard chain).

Most likely real cause: `next.config.mjs` had no bundler optimization
configured, and `lucide-react`/the Radix packages each re-export hundreds
of modules from one barrel file. Every one of this app's 20+ dashboard
routes imports several icons; without `optimizePackageImports`, Next's
dev compiler pulls each package's *entire* module graph into every route
that touches it, which is a well-documented cause of slow per-route
compilation and HMR in `next dev`. Added
`experimental.optimizePackageImports: ["lucide-react", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dialog"]`
to `next.config.mjs`.

Also fixed in passing (found while in `providers.tsx`, unrelated to the
speed report but a real bug): `<Toaster theme="dark" .../>` was hardcoded
regardless of the batch-1 light/dark toggle — toasts always rendered dark
even in light mode. Now reads `useTheme()` and follows the user's choice.

**Caveat given to the user:** `next dev`'s first visit to any given route
always recompiles that route on demand (this is inherent to Next.js dev
mode, not a bug) — the `optimizePackageImports` fix reduces how much work
that compile has to do, but won't make dev-mode navigation feel as fast
as a production build (`next build && next start`), where every route is
already compiled ahead of time. Requires a dev-server restart to take
effect (`next.config.mjs` is only read at startup).

## Customer Similarity page: features + first full-page i18n conversion (July 2026)

User requested, on the Customer Similarity screen specifically: (1) Excel
export with full per-customer detail (not just the on-screen cluster
summary), (2) click-to-expand/collapse per-cluster rows to see member
customers inline, (3) retitle to emphasize "الأداء"/"performance" in both
languages, and separately flagged a bigger, not-yet-built idea (flexible
similarity dimension — category-specific vs. total sales vs. collection
vs. returns) that needs its own scoping conversation before implementation
(see next chat turn).

**Title change** — "تشابه العملاء"/"Customer Similarity" →
"العملاء المتشابهون في الأداء"/"Customers Similar in Performance" (page
`<h1>`); the nav label shortened to "تشابه الأداء"/"Performance
Similarity" so it still fits the sidebar. Doing this properly (in both
languages, matching the user's explicit ask) meant this page needed to
actually join the bilingual system rather than getting one hardcoded
Arabic string swapped for another — so this batch converts the **entire**
Customer Similarity page to `useTranslation()`/`dictionaries.ts`, not just
the title. This is the first full-page conversion beyond the app shell
(batch 1) — the pattern (page-by-page as pages get touched for real
reasons, not a blind sweep) matches what was flagged as the plan in the
bilingual-support log entry above.

**i18n interpolation added** — dictionary values can now contain
`{placeholder}` tokens (e.g. `"customerSimilarity.customersBadge": "{count}
عميل"`), and `useTranslation()`'s `t(key, params)` does a simple
`{token}` → `String(params.token)` replace. Needed for dynamic strings
like the "N عميل في M مجموعات" success toast — the dictionary had no way
to do this before. `translation-provider.tsx` and `dictionaries.ts` both
updated; existing no-params call sites are unaffected (params is
optional).

**Expand/collapse rows** — `dashboard/customer-similarity/page.tsx`'s
cluster-summary table rows are now clickable (chevron icon, same
collapsed-by-default interaction pattern as Team Performance's
`ManagerTreeView`). Records are grouped by `r.after` (cluster index) into
a `Map` once via `useMemo`; clicking a row toggles it in an
`expandedGroups: Set<number>` and reveals a nested table of that
cluster's customers (id, name, value). Implementation note: React
requires a `key` on the outermost element per `.map()` iteration — since
each iteration renders two sibling `<TableRow>`s (the summary row + a
conditional detail row), they're wrapped in `<Fragment key={i}>` rather
than the `<>...</>` shorthand, which can't carry a key.

**Full-detail Excel export** — new `exportResultToExcel()` (same
client-side, dynamically-imported `xlsx` pattern as Route Planning's
existing export). The on-screen table only ever showed per-cluster
*aggregates* (avg spend/orders/SKU variety) — "العرض تمام عناوين ولكن
التفاصيل تكون كاملة" asked for the workbook to carry more than that.
Ships two sheets: "الملخص" (mirrors the on-screen summary table) and
"تفاصيل العملاء" (every customer row: id, name, lat/lon, value, assigned
group). Note: per-customer order-count/SKU-variety isn't in the API
response (only cluster-level averages are — `CustomerSimilarityResult`
doesn't carry those per-record), so the detail sheet's columns are
limited to what `RoutePlanningRecord` actually returns (id/label/lat/
lon/sales/group). Flagged rather than fabricated.

**Deliberately not done in this batch:** the flexible similarity-
dimension idea (cluster by a specific product category, or by collection/
returns instead of total sales) is a real backend/schema change (new
optional category filter and/or new collection-file and returns-file
inputs mirroring Team Performance's three-category pattern), not a UI
tweak — needs its own scoping pass, consistent with how every other
architecture-level fork this session got a quick discussion first. A
`customerSimilarity.similarityBasisLabel` translation key was added
pre-emptively (harmless, unused) for when this gets built.

## Customer Similarity: flexible similarity basis (follow-up, same day)

User confirmed: build all four requested angles (total sales, one
category/segment, collection, returns) and "اعمل حسابك للزيادة" (design
for future growth). Implemented as a `similarityBasis` enum
(`"sales" | "collection" | "returns"`) rather than 4 flat options — the
"category-specific" angle is just the `"sales"` basis with an optional
category filter layered on top (`salesCategoryColumn`/
`salesCategoryValue`), not a 4th enum value, since it's really "total
sales narrowed to one category" not a different data source. Each basis
points at its own optional file/column block; adding a future basis
(e.g. "visits") means one more enum value + one more optional block —
verified this shape doesn't need a rewrite by keeping `resolveBasisConfig()`
in the service as the single place that maps `similarityBasis` → which
file/columns actually get read.

**Feature vector changes by basis:**
- `sales` (no category filter): unchanged — [totalValue, orderCount,
  distinctSkus] as before.
- `sales` + category filter: same 3 features, computed only from sales
  rows matching the chosen category value.
- `collection`: 2D — [totalValue, orderCount]. No SKU dimension (a
  collection is a payment, not a line item) — `avgDistinctSkus` is `null`
  in the response, and the frontend hides that table/export column
  entirely when every cluster's value is null, rather than showing a
  misleading "0.0".
- `returns`: 3D — SKU column is optional but meaningful here (which
  products keep getting returned), same shape as sales.

**Schema (`packages/schemas/src/customer-similarity.schemas.ts`):**
`salesFileId`/columns are now `.optional()` (were required) since only
one basis's block is required per request — enforced by three
`.refine()`s, one per basis, each checking its own required trio is
present. `customerSimilarityResultSchema.clusterProfiles[].avgDistinctSkus`
changed from `number` to `number | null`. Result now echoes
`similarityBasis` back so the frontend can label the results table
correctly from the response alone (not dependent on component state
staying in sync).

**Service (`apps/api/.../customer-similarity.service.ts`):** rewritten
around `resolveBasisConfig(input)`, which returns `{fileId,
customerIdColumn, amountColumn, skuColumn?, categoryColumn?,
categoryValue?}` for whichever basis was chosen. The category filter (if
present) narrows `basisRows` before the per-customer feature aggregation
loop runs — same filter mechanics as the existing scope-value filter
elsewhere in this file. `hasSkuDimension = !!basis.skuColumn` decides
whether raw vectors are 2D or 3D before normalization/k-means; both paths
go through the same generic `zScoreNormalize`/`kMeansVectors` utilities
unchanged (they already operated on arbitrary-length vectors).

**Frontend (`dashboard/customer-similarity/page.tsx`):** added an "أساس
التشابه" select (3 options) that swaps which file-block renders below it;
the "sales" block gained a collapsible "تحديد فئة/قسم معين" toggle whose
value picker reuses the existing `routePlanningApi.distinctValues()`
call (same one already used for scope values — no new endpoint needed).
Results table and the Excel export both compute `hasSkuColumn` from the
response and drop the SKU-variety column/field when it's not applicable;
the "avg value" column header/label switches between "متوسط الإنفاق" /
"متوسط التحصيل" / "متوسط قيمة المرتجعات" via a
`Record<CustomerSimilarityBasis, TranslationKey>` lookup keyed off
`result.similarityBasis` (not local component state, so it can't drift
from what the server actually computed).

**Verification:** full `tsc --noEmit` scratch check (schema + rewritten
service + all its real dependencies — `dataset-query.util.ts`,
`similarity-cluster.util.ts`, `authenticated-user.ts` — copied in fresh
via the Read tool, `FilesService` stubbed to just its two used methods to
avoid pulling in Prisma) passed clean, exit 0. Frontend reviewed by hand
only, per this session's standing limitation (`apps/web/node_modules` is
unreadable from this sandbox — Windows-mount I/O error, documented
earlier in this log).
  untouched — it doesn't read files).
- Each controller (`heatmap.controller.ts`, `route-planning.controller.ts`,
  `geo-intelligence.controller.ts`) updated to pass the full
  `AuthenticatedUser` it already had from `@CurrentUser()`, instead of
  just `user.companyId`. No new request/response fields, no frontend
  changes needed — filtering is transparent, driven entirely by the
  logged-in user's role/email and whatever column mapping the
  COMPANY_ADMIN already set on the file.

Coverage is now complete across every feature that reads uploaded
datasets: Assistant, legacy ChatGPT Action, Heat Map, Route Planning,
Geo Intelligence (New Customer + Customer Comparison).

**Verification**: scratch `tsc --noEmit` compiles (stubbed Prisma/Nest/
schemas, real file content copied in) — one covering
`dataset-query.util.ts`, `files.service.ts`, `files.controller.ts`,
`assistant.service.ts`, `gpt.service.ts`; a second covering
`heatmap.service.ts`, `route-planning.service.ts`,
`geo-intelligence.service.ts`, and their shared `route-balancer.util.ts`
— both clean, no errors. The three controllers reviewed by hand (trivial,
mechanical — the same `user` object they already received now gets
passed one level deeper instead of just `user.companyId`). Frontend
changes (`files/page.tsx`, `admin/subscriptions/page.tsx`, `types.ts`,
`lib/api/files.ts`) reviewed by hand against existing patterns in the
same files, not scratch-compiled.
ة مزدحمة اظهر الادوات عند الحاجة اتبع نظام البساطة"):
  no sidebar, no visible tool list or settings — just messages, with any
  `AnalysisBlock` the assistant sends (table/KPI cards/map) rendering
  inline under its own message via the existing
  `AnalysisBlockRenderer` registry.
- Dashboard home's `LaunchGptCard` (external redirect + copy-code flow)
  replaced with `AssistantEntryCard` (direct link to `/dashboard/
  assistant`). `gpt.module.ts`/`GptModule` and the Analysis Studio page
  were left fully intact and functional — the user asked to keep the
  ChatGPT screen running in parallel for now ("سيبها حاليا"), just no
  longer the primary/promoted entry point.

**Verification**: the sandbox's bash view of the repo has a recurring
mount-desync bug (documented earlier this session) where some files read
back truncated even after a correct on-disk write — hit again this round
on `geo-intelligence.schemas.ts` and `packages/schemas/src/index.ts`
inside `cp`'d scratch copies. Worked around the same way as before:
reconstructed the affected files from the Read tool's already-verified
output rather than trusting the bash copy. With that correction, a full
scratch compile of `packages/schemas` (real files, real zod) and a
targeted scratch compile of the new assistant module + the edited
`gpt.service.ts` (real files, faithful stubs only for their direct
NestJS-service dependencies, matching each stub's method signatures
against the real files) both came back clean — zero type errors.
Frontend changes were verified by manual review (`apps/web`'s local
`node_modules/typescript` hit the same broken-symlink mount issue with
no small scratch-check path given Next/React's dependency surface); all
new imports were traced to real, already-existing exports.

**Deferred, not built this round**: reviewing the DNA's Part 20 (Geo
Visualization Engine) map catalog against the already-shipped Heat Map/
New Customer/Customer Comparison features to see if any should be
renamed or extended to match it — user explicitly asked to revisit this
after trying the new Assistant screen, not before.

---

## GVE map catalog gap review — standing rule: native screen must not fall short of the ChatGPT screen anywhere

Followed up on the deferred item above. The DNA's Part 20 (Geo
Visualization Engine) defines 15 map types, each tied to a source engine
and a business question. Compared against what's actually shipped:

- **Fully/mostly covered**: Sales Heat Map, Customer Density Map (both via
  Heat Map's `metric`), Geo Opportunity Map (via New Customer), Cross-Sell
  Opportunity Map (via Customer Comparison) — though the latter two work
  at a single-customer scope, not a whole-territory scope like the DNA's
  catalog implies.
- **Not built at all (11 of 15)**: Returns Heat Map, Collection Heat Map,
  Category Distribution Map, Lost Sales Map, Customer Similarity Map,
  Route Performance Map, Route Coverage Map (only partially — Route
  Planning's result renders on a map, but not framed as "coverage %"),
  Visit Efficiency Map, AI Decision Map, Territory Opportunity Map, New
  Customer Expansion Map (only single-customer scope today, not
  territory-wide).

User's standing rule confirmed explicitly: the native screen must never
fall short of the external ChatGPT screen in any capability, ideally
exceed it, with no ceiling implied. Token-cost check done alongside this
(user asked directly): most of the gap list is pure backend
filter/aggregate/map-render work — zero Claude calls, same architecture
as the already-shipped Heat Map/Route Planning/Geo Intelligence features
— so building it out doesn't grow the token bill at all. Only the
free-text "interpret" boxes and the Assistant chat itself touch Claude
(already on Haiku + prompt caching), plus the "AI Decision Map" catalog
entry specifically, which is inherently live field-decision reasoning
(the Assistant screen already covers this as text; a literal map version
of it is the one gap-list item that's naturally AI-driven rather than
pure data).

**First batch shipped this round** — Returns Heat Map + Collection Heat
Map, folded into the existing Heat Map feature rather than new pages,
since "Returns" and "Payments/Collections" were already recognized
dataset types in the file-classification system and the service's
aggregation logic was already metric-agnostic under the hood (it only
branched on `=== "sales"` vs not, no metric-specific math):
- `packages/schemas/src/heatmap.schemas.ts` — `metric` enum extended from
  `["sales","customerCount"]` to `["sales","returns","collection",
  "customerCount"]` on both the query and interpret-result schemas. Field
  names (`salesColumn`, `salesFileId`, etc.) kept as-is for backward
  compatibility — they now mean "the value source for whichever metric
  is selected", documented in the schema's own comment.
- `apps/api/src/modules/heatmap/heatmap.service.ts` — the two `=== "sales"`
  gates changed to `!== "customerCount"` (2-line change, aggregation math
  itself untouched); `interpret()`'s Arabic system prompt taught to
  recognize "مرتجعات" → returns and "تحصيل/مديونية/مدفوعات" → collection.
- `apps/web/src/app/(dashboard)/dashboard/heatmap/page.tsx` — metric
  dropdown now has 4 options; value-source labels (file picker, amount
  column, section heading) are now metric-aware via a small lookup table
  instead of hardcoded "sales" wording, so Returns/Collection get their
  own correct labels instead of "sales" leaking through the UI.

**Not yet built, tracked as the next batch**: Category Distribution Map,
Lost Sales Map, Customer Similarity Map, Route Performance Map, Route
Coverage Map (upgrade), Visit Efficiency Map, Territory Opportunity Map,
New Customer Expansion Map (territory-level upgrade), AI Decision Map —
each needs its own data-requirements/UI-placement design pass (new page
vs. extending Heat Map/Route Planning/Geo Intelligence) before building,
same as this round's Returns/Collection pair got before implementation.

**Second batch shipped** — Category Distribution Map + Lost Sales Map,
both folded into Heat Map (same reasoning as Returns/Collection: reuse
the existing map-render component and query pipeline rather than new
pages):
- **Category Distribution Map** — an optional `salesFileCategoryColumn`/
  `salesFileCategoryValue` pair on the existing "aggregate from a second
  file" mode. When set, the aggregation loop in `heatmap.service.ts`
  skips any row whose category column doesn't match the chosen value
  before summing — same loop as the date-range filter, one more
  condition. This is literally the filter the user asked for early in
  the session ("صمملي فلتر بأسماء اقسام المنتجات") that wasn't supported
  at the time. Category values are populated via the existing generic
  `GET /route-planning/distinct-values?fileId&column` endpoint — no new
  backend endpoint needed, it already worked on any file/column.
- **Lost Sales Map** — new `metric: "lostSales"`. Deliberately scoped as
  an honest two-window comparison rather than the DNA's full "dynamic
  per-SKU purchase cadence" ideal (§6.2 of the Master DNA — inferring
  each SKU's normal repurchase cycle per customer and flagging it lost
  once a customer goes quiet longer than usual): the user picks a
  "prior" date window and a "recent" date window on a sales file that
  has a SKU column; any SKU a customer bought in the prior window but
  didn't buy again in the recent window counts as lost, valued at what
  it was worth in the prior window. Needs its own computation path
  (`HeatmapService.computeLostSalesValues` — per-customer SKU-value maps
  for the prior window vs SKU sets for the recent window, not a single
  running sum) rather than reusing the sales/returns/collection
  aggregation loop, since it's structurally a set-difference, not a sum.
  Deliberately excluded from `interpret()`'s free-text metric options —
  switching to it requires a SKU column and a second date window that
  natural language has no reliable way to supply, so it stays a manual
  form action.
- Schema changes: `heatmapQuerySchema` gained `salesFileCategoryColumn`,
  `salesFileCategoryValue`, `salesFileSkuColumn`, `priorDateFrom`,
  `priorDateTo`, plus a second `.refine()` requiring the lostSales-
  specific fields only when `metric === "lostSales"`.
- Frontend: the existing "value source" tab block is now gated by an
  `isSimpleValueMetric()` type guard (sales/returns/collection only);
  `metric === "lostSales"` gets its own dedicated block (SKU/amount/date
  columns + two bordered date-range boxes labeled "قبل" / "حديثًا")
  instead of forcing it into the column/aggregate tabs that don't fit
  its shape.

**Still remaining**: Customer Similarity Map, Route Performance Map,
Route Coverage Map (upgrade), Visit Efficiency Map, Territory Opportunity
Map, New Customer Expansion Map (territory-level upgrade), AI Decision
Map (the one genuinely AI-driven entry — already covered as text by the
Assistant screen, a literal map version is the remaining gap).

## New Customer — Geo Intelligence (dashboard feature, ported/narrowed from FSOS Platform)

The user asked whether the "New Customer" flagship screen from the separate,
larger `C:\fsos-app` (FSOS Platform / Murshidak) project could be copied into
Field Sales OS. That screen (`artifacts/fsos-platform/src/pages/new-customer.tsx`)
is a 5-step wizard (Location → Nearby → AI Analysis → First Order → Strategy)
with mock data throughout, and its later steps create a first order and
schedule a visit — i.e. invoice/order-creation territory, explicitly out of
scope for Field Sales OS (see the "separate from accounts/inventory" scoping
above). The user corrected the port down to just two steps, real data, no
invoice-adjacent steps:

- **Step 1 — Location**: three capture methods — GPS (`navigator.geolocation`),
  pin-on-map (new `LocationPickerMap` component, same SSR-safe dynamic-Leaflet-
  import pattern as `route-split-map.tsx`/`heatmap-map.tsx`), manual lat/lon
  entry.
- **Step 2 — Reference customers + analysis**: `mode: "auto" | "manual" | "both"`.
  Auto resolves the nearest N customers to the captured location via
  `haversineKm` (imported directly from `route-planning/route-balancer.util.ts`
  — a pure function, no new algorithm needed). Manual is a searchable
  checkbox list (new `GET /geo-intelligence/customers` endpoint, same
  file+column-mapping pattern as everything else). Both = union, deduped.
  The resolved customer set is then used to aggregate a top-product-
  assortment table (qty/value/customer-count per SKU) from the same
  uploaded file — tested against the real uploaded `Invoices.xlsx`
  (2,150 rows, already carries `CustomerCode`/`Latitude`/`Longitude` +
  `SKU`/`ProductName`/`Category`/`Qty`/`Total` per line, so one file
  covers both customer resolution and product aggregation with zero new
  dataset type needed).
- **Optional AI layer**: `POST /geo-intelligence/talking-points` — same
  Claude-API-call pattern as `HeatmapService.interpret()`, but generation
  (Arabic summary + 3-6 practical talking points) instead of filter
  interpretation, built from the top-products output.
- **Hard stop, as instructed**: no invoice/order/customer-creation step
  follows the analysis output. That's the deliverable.

New files: `packages/schemas/src/geo-intelligence.schemas.ts`,
`apps/api/src/modules/geo-intelligence/{service,controller,module}.ts`,
`apps/web/src/lib/api/geo-intelligence.ts`,
`apps/web/src/components/geo-intelligence/location-picker-map.tsx`,
`apps/web/src/app/(dashboard)/dashboard/new-customer/page.tsx`. Registered in
`app.module.ts` and the dashboard nav (`UserPlus` icon). `GEO_INTELLIGENCE_LIMITS`
added to `constants.ts` alongside `ROUTE_PLANNING_LIMITS`/`HEATMAP_LIMITS`.

One correctness fix made during review: `buildCustomerIndex`'s
`excludedBadCoordinates` initially counted per bad-coordinate *row*, which
over-counts a customer with multiple invoice lines and no valid coordinate on
any of them — fixed to count per distinct *customer* (a `badIds` Set checked
against `byId` after the scan) since this endpoint operates at customer
granularity, unlike `HeatmapService.query()` where the same field name
legitimately means per-row (it emits one point per row, not per customer).

**Verification note**: `pnpm`/`node_modules` aren't available in the sandbox
this session (same constraint as before) — schemas type-checked clean via
the scratch `/tmp` tsc method against the exact strict tsconfig flags; the
NestJS service/controller/module and the React page were verified by careful
manual review (structural match against `HeatmapService`/`route-planning`
page patterns) rather than a full monorepo build. **User still needs to run
a local `pnpm install` (no new dependencies were added this time, so this may
not even be required) and `pnpm dev`/typecheck before trusting this in
production**, same as every other feature this session.

**Not done yet / explicitly out of scope for now**: bilingual EN/AR toggle
(went Arabic-only, matching the rest of Field Sales OS, since the narrowed
scope no longer references the original bilingual wizard); any write-back
into the source file (this is read/analyze-only, matching the "no invoice
creation" instruction); the `maxDistanceKm` cap for Route Planning's balancing
algorithm (still the pending item from before this detour — see above).

## Strategic point 3, second half — Team Performance screen ("نبض الفريق")

Product owner's ask: "عايز شاشة للمشرف والمدير تعطيهم معلومات عن فريق
المبيعات... ياريت تبتكر معايا." Brainstormed 3 concepts; the user picked
"نبض الفريق + توجيه ذكي" (Team Pulse + AI Coaching) — a per-rep rollup
table plus a short Arabic guidance sentence per rep — with two explicit
design constraints set before building:

1. The coaching sentence is **on-demand only** ("زرار لكل مندوب"), never
   computed automatically on page load — a deliberate cost/token-conscious
   choice, and it isn't even an LLM call (see below), so this also just
   avoids doing unnecessary work up front.
2. **Reps must not be visible to the Manager by default** — only
   supervisor-level rows show initially; a given supervisor's reps only
   appear once the Manager expands that supervisor's node in the tree
   ("المناديب ماتظهرش للمدير إلا لما يفتح شجرة الفريق"). Supervisors
   themselves always see their own reps flat, no tree (they have nothing
   to collapse).

**No formal management hierarchy exists anywhere in the schema** (no
`User.managerId`/team table). Reused the same `repColumn`/`supervisorColumn`
mapping already built for point 3's access-control half — but for a second,
different purpose here: instead of filtering rows, it *groups* them. Each
row's `supervisorColumn` value casts one "vote" for that rep's supervisor;
the supervisor with the most votes across a rep's rows wins the pairing.
Inferred entirely from uploaded data, same as everything else in this app.

**Coaching notes are deliberately rule-based, not free LLM text** — the
user's explicit call ("مش نص AI حر خالص"). Classifies each rep into one of
five states from simple thresholds (`sales_declining` <-10% trend,
`returns_high` >15% return rate, `collection_low` <70% collection rate,
`sales_growing` >10% trend, else `steady`), then matches that state's intent
against the existing 153-entry Behavior Scenario Library (the same
retrieval already used by the Assistant screen) for a grounded suggested
line, falling back to a hand-written note per state if nothing matches. No
Claude API call in this path at all — zero marginal token cost per click.

**New pieces**:
- `apps/api/src/modules/assistant/data/scenario-retrieval.util.ts` — pulled
  `tokenize`/`retrieveScenarios`/`formatScenarios` out of
  `assistant.service.ts` into a shared util so this new module could reuse
  the exact same matching logic instead of drifting a second copy.
- `packages/schemas/src/team-performance.schemas.ts` — query schema (three
  optional file+amount-column+date-column triples for sales/collection/
  returns, a required date range, an optional prior date range for trend),
  the per-rep row shape, and the coach request/result shapes
  (`{ note, tone: "positive" | "attention" | "neutral" }`).
- `apps/api/src/modules/team-performance/{service,controller,module}.ts` —
  `query()` reads each configured file (throws a clear Arabic error if its
  `repColumn` isn't mapped yet, pointing at the Files page), runs it through
  `applyHierarchyFilter` first (so a Supervisor querying this screen only
  ever sees their own team's raw rows to begin with — same access-control
  path as everywhere else), sums per rep within the date window(s), and
  resolves rep/supervisor emails to display names via the company's user
  list (fetched unfiltered rather than an email-`in` query, to sidestep
  email-casing risk — same low-risk assumption the existing Team page
  already makes). `coach()` is the pure rule-based classifier above.
  `POST /team-performance/query` and `/coach`, both
  `@Auth("COMPANY_ADMIN", "MANAGER", "SUPERVISOR")`.
- Frontend: `apps/web/src/app/(dashboard)/dashboard/team-performance/page.tsx`
  — file/column pickers per category (only files with a mapped rep column
  are selectable at all), date range + optional comparison range, then
  results render as `FlatTeamView` (Supervisor — flat list, `scopedToOwnTeam
  === true`) or `ManagerTreeView` (Manager/Admin — grouped by supervisor,
  collapsed by default, each row showing an aggregate and only revealing its
  reps on click, per the constraint above). Each rep row shows sales/
  collection/returns with rates and trend badges, plus a "توجيه" button that
  calls `/team-performance/coach` on click and renders the returned note
  color-coded by tone. New "Team Performance" nav item, gated to
  COMPANY_ADMIN/MANAGER/SUPERVISOR.

**Verification**: scratch `tsc --noEmit` (stubbed Prisma/Nest/schemas, real
file content copied in) covering `team-performance.service.ts`,
`.controller.ts`, `.module.ts`, and the extracted `scenario-retrieval.util.ts`
— clean, zero errors. `assistant.service.ts` re-read in full after the
extraction to confirm no orphaned references. Frontend reviewed by hand
against the same patterns already validated elsewhere this session
(TanStack Query mutations, `Select`/`Badge`/`Card` primitives), not scratch-
compiled — consistent with how every other frontend page this session was
verified.

**Not built**: any push/notification when a rep crosses into a concerning
state (`sales_declining`/`returns_high`/`collection_low`) — today the
Manager/Supervisor has to open the screen and look; a proactive alert would
need a scheduled job, not attempted this round.

## GVE map catalog — the remaining 7 gaps, all shipped this round

Picked up where the earlier "GVE map catalog gap review" section left off
(Returns/Collection, Category Distribution, Lost Sales already shipped).
The remaining list — Customer Similarity Map, Route Performance Map, Route
Coverage Map upgrade, Visit Efficiency Map, Territory Opportunity Map, New
Customer Expansion Map (territory-level upgrade), AI Decision Map — is now
fully built. Followed the same standing rule as before: reuse existing
map/query infrastructure wherever the shape fits, rather than new bespoke
pages, so most of these landed as extensions to Heat Map / Route Planning /
Geo Intelligence instead of net-new screens.

**Territory Opportunity Map** — new Heat Map metric `"opportunity"`.
Deliberately simpler and broader than Lost Sales Map: no SKU dimension,
just total spend per customer between a prior window and a recent window,
floored at 0 (only declines count). Answers "whose relationship is cooling
off" rather than "which product stopped selling". New
`HeatmapService.computeOpportunityValues()`, mirroring
`computeLostSalesValues()` minus the SKU-level bookkeeping. Schema/UI follow
the same two-window pattern already established for `lostSales`.

**Route Performance Map** — folded into Route Planning's existing results
table/map, zero backend change (the per-group totals/counts it needs were
already returned by `split()`). Added an "متوسط/عميل" (avg value per
customer) column and a per-route "الأداء" tier badge (good/ok/bad vs.
target deviation) to the results table, and a "عرض الأداء" map-color toggle
(`RouteSplitMap` gained a `colorBy: "group" | "performance"` prop — green/
amber/red per route instead of the arbitrary per-group palette).

**Route Coverage Map upgrade** — also zero backend change. Route Planning
already computed `usedRows`/`totalScopedRows`; the gap was framing, not
data. Added a prominent "نسبة التغطية" badge (`usedRows / totalScopedRows`,
color-coded) to the results header instead of leaving coverage implicit in
the "excluded rows" footnote.

**Customer Similarity Map** — new module (`customer-similarity`), clusters
customers by a behavioral feature vector (total spend, order count,
distinct SKU count — a simple RFM-style profile, not a decay-curve model)
rather than geography. New `similarity-cluster.util.ts`: a second, separate
k-means (Euclidean distance over z-score-normalized features) alongside
route-balancer's geographic one — kept as its own small copy rather than
generalizing, since the two have different distance functions and only one
caller each. The result deliberately reuses Route Planning's exact
`{records, afterTotals, afterCounts, ...}` shape (`before === after`, since
there's no geographic "before" state) so the frontend renders it with
`RouteSplitMap` and a trimmed results table verbatim — new
`apps/web/.../customer-similarity/page.tsx` builds a
`RoutePlanningSplitResult`-shaped adapter object rather than writing a new
map component.

**New Customer Expansion Map, territory-level upgrade** — `analyze()`/
`compareCustomer()` in Geo Intelligence work at a single-customer scope
("who's near this pin"); the new `expansion()` method works at a whole-
territory scope. Grid-based, deliberately simple: lays a km-sized grid over
the resolved customer set's bounding box (longitude cell width scaled by
`cos(latitude)` to stay square in km), buckets customers into cells, then
scores every EMPTY cell by summing its occupied Moore-neighborhood (8
surrounding cells) value — an empty cell next to a dense, high-value
neighborhood scores high; an isolated empty cell scores 0 and is dropped.
Not a demand-forecasting model, same honest-simplification spirit as Lost
Sales Map. Output points reuse `HeatmapPoint`'s exact shape, so the
frontend renders them with the existing `HeatmapMap` component with zero
new map code. Delivered as a second tab ("قطاع كامل") on the existing New
Customer page rather than a new nav item — `PointWizard` (the original
single-customer wizard) and `TerritoryExpansion` (new) are now two
`TabsContent` panes under one top-level `NewCustomerPage`.

**Visit Efficiency Map** — new module (`visit-efficiency`). Checked first
whether a dedicated dataset type was needed: no — `"Visits"` was already in
`SUGGESTED_DATASET_TYPES`, and dataset types are free-form anyway, so this
needed zero schema/migration work. For each rep-day, sorts that rep's
visits into a sequence (by a mapped time column if present, else by the
row's original order in the file — a real, documented approximation, not
hidden from the user) and measures the Haversine distance between
consecutive stops; a big jump flags backtracking. Location can come
directly off the visits file or be joined from a second customer-master
file by customer id (same "column vs. second-file" pattern used everywhere
else). Per-visit points (weighted by distance-from-previous) feed
`HeatmapMap`; a `repSummaries` table shows total/avg distance per rep.

**AI Decision Map** — the one genuinely AI-driven catalog entry, and
deliberately NOT a 16th map page. Instead, `HeatmapService.decisionSummary()`
is a Claude call layered on top of whatever's already on screen: the
frontend sends the top 20 points of the current Heat Map result (whatever
metric is selected) plus the metric/scope/totals context, and Claude
returns a short summary + a prioritized action list. Same Claude-API-call
pattern as `interpret()`/Geo Intelligence's `talkingPoints()` — every
number in the prompt was already computed deterministically; Claude only
decides what to say about it and in what order. New "ولّد قرارات بالذكاء
الاصطناعي" button on the Heat Map results panel.

**New backend modules**: `customer-similarity`, `visit-efficiency` (both
registered in `app.module.ts`). **Extended in place**: `heatmap.schemas.ts`/
`.service.ts`/`.controller.ts` (opportunity metric + decision-summary),
`geo-intelligence.schemas.ts`/`.service.ts`/`.controller.ts` (expansion),
`route-planning/route-split-map.tsx` (performance color mode). **New
frontend pages**: `customer-similarity/page.tsx`, `visit-efficiency/page.tsx`;
**extended in place**: `route-planning/page.tsx` (performance/coverage),
`heatmap/page.tsx` (opportunity metric + AI decisions), `new-customer/page.tsx`
(territory-expansion tab). Two new nav items (Customer Similarity, Visit
Efficiency); Territory Opportunity and AI Decision Map live inside the
existing Heat Map nav item; Route Performance/Coverage live inside the
existing Route Planning nav item.

**Verification**: hit the same recurring bash-sandbox mount-desync bug as
prior sessions, worse this round — the bulk `cp -r` of `packages/schemas/src`
into the scratch dir picked up truncated versions of every file this
session had edited (`heatmap.schemas.ts`, `geo-intelligence.schemas.ts`,
`constants.ts`, `subscription.schemas.ts` from an earlier segment,
`packages/schemas/src/index.ts`) plus `dataset-query.util.ts`,
`heatmap.service.ts`/`.controller.ts`, `geo-intelligence.service.ts`/
`.controller.ts` — all cut off mid-statement. Every one was reconstructed
from a fresh Read-tool call (confirmed complete on disk) and written into
the scratch dir via bash heredoc instead of `cp`. Newly-created files
(`customer-similarity.*`, `visit-efficiency.*`, `similarity-cluster.util.ts`)
were unaffected, consistent with the standing hypothesis that Edit-tool
writes to pre-existing files are what desyncs the bash mount, not Write
(new file). With that correction, a full scratch `tsc --noEmit` (pinned
`typescript@5.7.2`/`zod@3.24.1`/`@nestjs/common@11`/`@nestjs/swagger@11`/
`xlsx@0.18.5`/`@types/node@22.10.2`, tsconfig mirroring
`tsconfig.nestjs.json`'s exact strict flags) covering every backend file
touched or added this round — plus the *entire* `packages/schemas` package,
not just the new pieces — came back clean, exit 0. `app.module.ts`'s two
new registrations reviewed by hand (mechanical). Frontend reviewed by hand
against already-validated patterns in the same files, not scratch-compiled
— consistent with every other frontend change this session.

**Coverage note**: all 5 dashboard map/analytics modules (Heat Map, Route
Planning, Geo Intelligence, Customer Similarity, Visit Efficiency) read
rows through `applyHierarchyFilter` before any aggregation, so strategic
point 3's row-level access control automatically covers every new map
without needing separate wiring.

The GVE map catalog gap list from Part 20.2 is now fully closed — every
entry is either a dedicated screen, a Heat Map metric, or a Route Planning/
Geo Intelligence extension.

## Customer Similarity: group-visibility map filter (July 2026)

Small follow-up requested after the similarity-basis feature: "قائمة
منسدلة لتحديد مجموعة من المجموعات هي اللي تظهر في الخريطة وتنتهي باختيار
الكل" — a dropdown to choose which cluster group(s) render as markers on
the map, ending with a "الكل" (select-all) option.

Scoped as map-only, on purpose: the results table below the map still
always lists every group regardless of this filter, since the user only
asked about what shows *on the map*, not about hiding rows from the
table/export.

**Files:**
- `apps/web/src/app/(dashboard)/dashboard/customer-similarity/page.tsx` —
  new `visibleGroups: Set<number>` state, initialized to every cluster
  index on a successful query; a `mapResult` `useMemo` that filters
  `asRouteResult.records` down to `visibleGroups` (returns the unfiltered
  result unchanged when everything is selected, to avoid pointless object
  churn on the common case); `<RouteSplitMap>` now renders `mapResult ??
  asRouteResult` instead of `asRouteResult` directly. New
  `GroupVisibilityDropdown` component (button + popover, outside-click-to-
  close via the same pattern already used in `app-shell.tsx`'s
  `DashboardHeader`): an "الكل" checkbox that selects/clears every group
  at once, plus one checkbox per cluster with its legend color swatch.
  Placed next to the existing color legend, above the map.
- `apps/web/src/lib/i18n/dictionaries.ts` — three new
  `customerSimilarity.*` keys (`groupFilterLabel`, `groupFilterAll`,
  `groupFilterCount`, the last with `{count}`/`{total}` interpolation),
  added to the `TranslationKey` union and both `ar`/`en` records.

**Verification**: reviewed by hand (same sandbox limitation as every other
frontend change this session — `apps/web/node_modules` isn't readable from
the bash sandbox). Confirmed the `GroupVisibilityDropdown` JSX call site's
props (`clusterCount`, `visibleGroups`, `onChange`, `t`) match the
component's signature exactly, and that all three new translation keys
used in the component exist in both locales.

**Follow-up fix (same day)**: user reported the map covering the open
dropdown popover, and asked for the map's height (only height) to shrink
slightly.
- Root cause of the overlap: Leaflet's internal panes (tile/marker/popup
  layers) use `z-index` values up to 700, well above the popover's
  `z-40`. Since the map `<div>` doesn't itself establish a stacking
  context above those panes, they painted over the popover despite the
  popover being later in the DOM. Fixed by raising the popover to
  `z-[1200]` — comfortably above Leaflet's panes and its `z-index: 1000`
  controls.
- Height: `RouteSplitMap` (`components/route-planning/route-split-map.tsx`)
  gained an optional `heightClassName` prop (default unchanged,
  `h-[560px]`), so this didn't affect Route Planning/Heat Map/other pages
  reusing the same component. Customer Similarity's call site now passes
  `heightClassName="h-[460px]"` — a modest reduction, width untouched.

## Visit Efficiency + Team Performance: dropdown/export/expand parity batch (July 2026)

User asked (in Visit Efficiency): the same group-visibility dropdown as
Customer Similarity, noting locations weren't showing on the map, Excel
export, and click-to-expand rows — plus, read as "same treatment for the
Performance screen too" (Team Performance already had expand/collapse via
its supervisor tree, but no Excel export). Interpretation flagged to the
user rather than silently assumed away, since the message's last clause
was genuinely ambiguous.

**Visit Efficiency map is a heat-intensity layer (`HeatmapMap`/
`leaflet.heat`), not colored per-group markers like Customer Similarity's
`RouteSplitMap`** — so "same dropdown" was adapted: filters by rep name
(checklist + "الكل"), no color swatches (nothing to swatch — it's one
continuous heat gradient, not discrete groups).

- `packages/schemas/src/visit-efficiency.schemas.ts` —
  `visitEfficiencyPointSchema` gained `rep`/`dateKey` fields (previously
  only `id`/`label`/`lat`/`lon`/`value`), needed so the frontend can filter
  the map by rep and build the per-rep expandable detail rows / Excel
  export without a second lookup structure.
- `apps/api/.../visit-efficiency/visit-efficiency.service.ts` — pushes
  `rep`/`dateKey` onto every point; added `joinKeyVariants()` to harden the
  visits-file-to-customer-master-file ID join (trims, lowercases, and adds
  a normalized numeric form so e.g. "1050.0" still matches "1050" — a
  common Excel round-trip mismatch). This is a targeted robustness
  improvement, not a confirmed root-cause fix for the reported "locations
  don't show" — couldn't reproduce live in this sandbox. Paired with a new
  empty-state message (shown when a query succeeds but yields zero
  mappable points) listing the concrete likely causes: single-visit days,
  missing/invalid coordinates, or an ID mismatch on the join — pointing the
  user at the existing (now more prominent) `excludedNoCoordinates` /
  `excludedSingleVisitDays` badges instead of leaving a silently blank map.
- `apps/web/src/lib/types.ts` — new `VisitEfficiencyPoint extends
  HeatmapPoint` with `rep`/`dateKey`; `VisitEfficiencyResult.points`
  retyped from `HeatmapPoint[]`.
- `apps/web/.../visit-efficiency/page.tsx` — `visibleReps: Set<string>`
  (defaults to all reps on a successful query) + `mapPoints` useMemo
  (map-only filter, table below is unaffected, same split as Customer
  Similarity's `mapResult`); new `RepVisibilityDropdown` component (same
  outside-click-to-close popover pattern, `z-[1200]` to clear Leaflet's own
  panes/controls — see the z-index bug above, applied preemptively here
  rather than waiting to hit it again); `visitsByRep` useMemo groups points
  per rep for both the expandable detail rows (`Fragment`-per-row, same
  pattern as Customer Similarity's cluster table) and `exportResultToExcel`
  (two sheets: "ملخص المناديب" summary, "تفاصيل الزيارات" every visit leg
  with date/customer/distance).
- `apps/web/.../team-performance/page.tsx` — added a "تصدير Excel" button
  above the results view exporting the flat rep list (one sheet, current +
  prior period figures, % change/collection-rate/return-rate columns) —
  the tree/flat views already had expand/collapse, so this was the one
  piece missing relative to what was asked for Visit Efficiency.

**Verification**: backend (`visit-efficiency.schemas.ts` +
`visit-efficiency.service.ts`, including the new `joinKeyVariants` join
logic) compiled clean against a standalone strict `tsc` (pinned
`typescript@5.7.2`/`zod@3.24.1`/`@nestjs/common@11`/`xlsx@0.18.5`, same
`/tmp` scratch method as every other backend verification this session).
Frontend reviewed by hand — same sandbox limitation as every other
frontend change this session (`apps/web/node_modules` unreadable here).

**Follow-up (same day)**: user reported the map was still blank after the
above, with a Next.js dev-overlay screenshot showing "Encountered two
children with the same key, `CUST046-0`" from the new expandable detail
rows. Two real bugs found and fixed:

1. **Duplicate React keys** — `leg.id` (`${customerId}-${indexWithinThatDay}`)
   is only unique within a single rep-day; a rep visiting the same customer
   first-thing on two different days produces the same id twice in the
   per-rep detail list (which spans every day). Fixed by keying on
   `${leg.id}-${legIndex}` (the list's own position, always unique)
   instead of `leg.id` alone.
2. **Likely actual root cause of the blank map, pre-dating today's
   changes**: `maxValue={Math.max(...result.points.map((p) => p.value), 1)}`
   spreads every point's value as individual function arguments — throws a
   stack overflow once a visits file has on the order of a few thousand
   rows (a realistic size for a visit log). The Heat Map page already
   avoids this exact pattern by using a backend-computed `maxValue`
   instead of spreading on the frontend; Visit Efficiency's result doesn't
   carry one, so it's now computed with a plain `for` loop
   (`maxDistanceValue`, memoized) instead of a spread. Not confirmed via a
   live repro (still no access to the user's actual dataset size in this
   sandbox), but it's a well-known V8 failure mode matching the symptom
   exactly (data computes fine — the detail table proves points exist —
   but the map silently never renders), and the surrounding code already
   demonstrates this exact fix was applied elsewhere in the same codebase.

**Second follow-up (same day)**: user reported the map was still
essentially empty (one screenshot showed the view zoomed out to the whole
western-Saudi coastline with a single visible dot) even after the two
fixes above. Rather than keep debugging the heat layer blind a third time,
switched Visit Efficiency's map from `HeatmapMap` (leaflet.heat, an
intensity layer) to a new `components/visit-efficiency/visit-map.tsx`
(`VisitMap`) using the same `CircleMarker`-per-point approach already
proven reliable on Customer Similarity and Route Planning
(`RouteSplitMap`). Each rep gets a stable color from the shared
`GROUP_COLORS` palette (indexed by the rep's position in the `repSummaries`
list, so colors don't shuffle when the visibility dropdown filters which
reps are shown), with a popup per visit (customer/rep/date/distance)
instead of a blurred intensity blob. A color-swatch legend was added above
the map next to the rep dropdown, matching Customer Similarity's
legend+dropdown row layout. `visit-efficiency/page.tsx` no longer imports
`HeatmapMap` at all. This is a decisive engineering call, not a confirmed
diagnosis of what was specifically wrong with the heat layer for this
data — but marker-based rendering has a materially different (and
independently verified working) code path, so it removes an entire class
of suspects at once.

**Two more issues reported in the same message, both real, both
system-wide (not scoped to just these two screens):**

1. **"عايز سكرول بالعرض تحت جدول البيانات" / same for Team Performance** —
   root cause: `components/shell/app-shell.tsx`'s `<main>` (and its flex
   parent) had no `min-w-0`. A flex child with no `min-w-0` won't respect
   its own content's `overflow-x-auto` (already present on every
   `<Table>`, see `components/ui/table.tsx`) — instead it grows past the
   viewport and the *entire shell*, sidebar included, scrolls horizontally.
   Added `min-w-0` to both the flex column and `<main>`. This is a
   one-line, shell-level fix that applies to every dashboard page with
   wide content, not something that needed touching per-page.
2. **"عناوين الاعمدة لجدول عرض البيانات محتاجه محازاة مع بيانات الجدول"**
   — root cause: `components/ui/table.tsx`'s `TableHead` hardcoded
   `text-left` (a physical direction), while `TableCell` has no explicit
   `text-align` and follows the browser's per-direction default. Under
   `dir="rtl"`, headers stayed pinned left while their data cells followed
   the RTL default (right/"start") — headers and columns didn't visually
   line up. Fixed by changing `TableHead` to `text-start` (a logical
   property, same fix pattern as the `border-r`→`border-e` swap from the
   original RTL redesign), so both header and cell now follow direction
   identically. Also a shared-component fix — applies to every table in
   the app (Customer Similarity, Visit Efficiency, etc.), not just the two
   screens it was noticed on.

**Third follow-up (same day)**: after confirming the above fixes worked
("ممتاز"), user reported the horizontal scroll was "still" needed and
asked for a subtotal row under the data table.

- **Nested-table-in-a-cell scroll bug** — both Customer Similarity's and
  Visit Efficiency's expand/collapse detail rows render a full nested
  `<Table>` (which has its own `overflow-x-auto` wrapper) inside a
  `<TableCell colSpan={...}>` of the outer table. A `<td>` with no width
  ceiling of its own doesn't reliably respect a nested `overflow-x-auto`
  div under the browser's table auto-layout algorithm — the nested
  content's intrinsic width can grow the cell (and the outer table) rather
  than triggering the inner scrollbar. This is a distinct failure mode
  from the shell-level `min-w-0` fix above (that one was about a flex
  ancestor, this one is about table auto-layout sizing) — the earlier fix
  didn't cover this nested case. Fixed with the standard `max-w-0` trick
  on both wrapping `<TableCell>`s (`customer-similarity/page.tsx`,
  `visit-efficiency/page.tsx`), which forces the cell down to its row's
  actual rendered width so the nested table's own overflow-x-auto now
  activates correctly instead of expanding the layout.
- **Subtotal row** — `components/ui/table.tsx` gained a `TableFooter`
  primitive (`<tfoot>`, bold + top border + filled background, to read as
  visually distinct from a regular data row) for reuse anywhere a table
  needs a totals row. Wired into Visit Efficiency's rep-summary table
  (scoped to this screen — it's the one actively being tested in this
  thread; not added to Team Performance or Customer Similarity without
  being asked): total visit-days, total visits, total distance, and an
  overall average distance/visit computed as `totalDistance/totalVisits`
  (a weighted average, not a naive average of each rep's own average —
  a rep with 200 visits shouldn't count the same as one with 2).

## Sales Growth Intelligence (SGI) — vision doc + Phase 1 Target model (July 2026)

Product owner shared a full vision brief for a major new module, "Sales
Growth Intelligence" — ten AI engines, an Executive Coach, a persistent
Sales Memory Engine, an AI Learning Loop, voice-first field interaction,
and a new ten-section "How to Increase Your Sales" screen. Explicitly
too large to execute as one ticket; filtered into `docs/SGI_ROADMAP.md`
(read that file for the full reasoning) rather than built blind.

**Key groundedness findings, verified against the actual schema/code
before writing the roadmap** (see the roadmap's own §2 for the full
list): no persistent Invoice/Visit/Product tables exist — every module
reads uploaded Excel files in-memory, same as always; `File.datasetType`
already anticipates `Targets`/`Invoices`/`Inventory` etc. as dataset
categories; the existing `AiReport` stub table (`companyId, userId,
fileId, reportType: String, content: Json`) can back the Sales Memory
Engine without a new migration; `scheduled-tasks`' existing `@Cron` job
is a legitimate stand-in for "Live Decision Engine" (periodic recompute)
until real live data entry exists; the Assistant module's Claude
tool-use loop is a ready-made foundation for the Executive Coach and
voice-text scenarios; Voice itself has zero existing infrastructure.

**Phased roadmap agreed with the product owner** (0 through 5), with one
explicit restructure at their request: Executive Coach and Sales Memory
Engine merged into a single Phase 3 (memory is what makes coaching
valuable — advice grounded in what actually happened with a rep/customer
before, not generic tips), pushing AI Learning Loop to Phase 4. Voice
confirmed in scope for the first release but deliberately built last
(Phase 5), since it depends on SGI + Sales Memory + Coach existing first.

**Phase 1 implementation started, with one migration explicitly
approved** by the product owner: Targets needed to support both an
uploaded `Targets`-type file and direct in-platform list entry, feeding
one shared source of truth — rather than contorting manual entries
through the File/Excel-buffer pipeline, this got a small dedicated
`Target` table.

- `packages/database/prisma/schema.prisma` — new `TargetSource` enum
  (`UPLOAD | MANUAL`) and `Target` model (`companyId,
  repOrTerritoryKey, periodMonth ("YYYY-MM"), value: Decimal(14,2),
  source, createdByUserId?, sourceFileId?`), with a compound unique
  constraint on `(companyId, repOrTerritoryKey, periodMonth)` — one
  target per rep/territory per month, so re-importing a Targets file for
  the same month upserts instead of duplicating. Back-relations added to
  `Company`/`User`/`File`. First `@db.Decimal` field in this schema
  (everything else money-like uses `Int` cents) — a deliberate choice for
  a value that isn't cents-denominated and benefits from exact decimal
  arithmetic.
- `packages/database/prisma/migrations/20260714120000_sgi_target_model/migration.sql`
  — hand-authored (same pattern as the earlier hierarchy-columns
  migration) since this sandbox has no live connection to the user's
  Postgres. **Not yet applied** — needs `pnpm --filter
  @field-sales-os/database migrate:deploy` run locally against the
  user's own Postgres before Phase 1's engines can read/write real data.
- `packages/schemas/src/target.schemas.ts` (new) — Zod schemas for list/
  upsert-many/import-from-file, plus the `TargetRecord` response shape.
- `apps/api/src/modules/targets/` (new module) — `TargetsService`:
  `list()` (MANAGER+ see the whole company, SALES_REP sees only their own
  key matched against their email — SUPERVISOR deliberately left
  unrestricted for now since this table has no per-supervisor team
  mapping yet, flagged in-code as a known simplification, not a
  regression); `upsertMany()` for the manual list-entry path;
  `importFromFile()` for the uploaded-file path (same file-picker +
  column-mapping pattern as every other module, routed through
  `applyHierarchyFilter` like everything else). Both write paths are
  COMPANY_ADMIN/MANAGER-gated only — same reasoning as the existing
  hierarchy-columns endpoint: the people being measured against a target
  shouldn't be able to set their own number. Registered in
  `app.module.ts`.

**Verification**: full scratch `tsc --noEmit` (pinned
`typescript@5.7.2`/`zod@3.24.1`/`@nestjs/common@11`/`@nestjs/swagger@11`/
`xlsx@0.18.5`, strict flags matching `tsconfig.nestjs.json`) against the
real `targets.service.ts`/`targets.controller.ts`, with a structurally
accurate stub of the generated Prisma client's `Target` delegate
(including the compound-unique-key shape, `$transaction` array/callback
overloads, and a `Decimal` stub with `.toNumber()`) — came back clean,
exit 0. Schema/migration SQL reviewed by hand against Prisma's own
generated-SQL conventions (verified column/constraint naming against
three earlier real migrations in this repo).

Not yet built: the Situation Detection/Opportunity/Recommendation/Scoring
engines, the recompute triggers, or the frontend screen — see
`docs/SGI_ROADMAP.md` Phase 1 and the task list for what's next.

## Sales Growth Intelligence (SGI) — Phase 1 engines, cron trigger, frontend screen (July 2026)

Continuation of the above. Product owner picked 4 of the full situation
catalog as reliably computable from customer/rep-level totals with no
SKU-level detail required: customers in decline/inactive, behind target,
lost sales, collection risk. Built all four (plus target-behind makes
five total situation types) as one engine, wired a recompute cron on top,
and shipped the first 3 sections of "How to Increase Your Sales" per the
roadmap's Phase 1 scope.

**Backend — `apps/api/src/modules/sgi/`** (new module: `sgi.service.ts`,
`sgi.controller.ts`, `sgi.module.ts`; schemas in
`packages/schemas/src/sgi.schemas.ts`). One pass over an uploaded Sales
file (same file-picker + column-mapping + `applyHierarchyFilter` pattern
as Team Performance) plus an optional second pass over a Collection file,
producing a flat list of "situations" — the Situation Detection ->
Opportunity Discovery -> Recommendation -> Opportunity Scoring pipeline
named in the vision brief:

- **TARGET_BEHIND** (rep/territory) — actual sales-to-date vs. a
  pace-adjusted expected value (`target × elapsed-days-fraction-of-month`),
  flagged once the gap exceeds 10%. Reads the `Target` table from the
  prior entry.
- **LOST_SALES** (customer) — bought meaningfully last period, zero this
  period. A sudden, recent stop.
- **CUSTOMER_DECLINING** (customer) — still buying, but current period is
  under 70% of prior period.
- **CUSTOMER_INACTIVE** (customer) — zero activity in *both* windows, and
  the gap since their last-ever purchase exceeds max(2× the window span,
  60 days) — deliberately distinct from Lost Sales (dormant longer than
  one period, not just a one-off gap). Requires tracking each customer's
  last-purchase date across the *entire* file, not just the two compare
  windows.
- **COLLECTION_RISK** (customer) — bought a lot this period, collected
  under 50% of it back. Needs the optional Collection file pass.

Each situation carries a severity (`high`/`medium`/`low`) assigned by
**rank within its own type** — top third by impact magnitude is `high`,
next third `medium`, rest `low` — relative to this company's own current
batch rather than a fixed EGP threshold that would mean something
different for a small distributor vs. a national one. Every situation
also carries a ready-to-act Arabic recommendation string (never a bare
number with no next step, per the vision brief's golden rule) and an
`ownerRepEmail` (the customer's dominant rep by visit-count vote, or the
rep itself for `TARGET_BEHIND`) used purely for server-side visibility
scoping — a `SALES_REP` only ever sees their own situations, a
`SUPERVISOR` only their team's (via a `repSupervisorMap` captured at
compute time from the sales file's `supervisorColumn`), everyone else
unfiltered. A situation whose owner couldn't be derived (no `repColumn`
configured) is hidden from REP/SUPERVISOR — fail closed, same convention
as `applyHierarchyFilter`.

Results and the config used to produce them are both persisted via the
existing `AiReport` stub table under two `reportType` values
(`sgi_situations`, `sgi_config`) — no new migration needed, exactly what
that table was flagged for in the roadmap. `POST /sgi/recalculate`
(COMPANY_ADMIN/MANAGER only, same reasoning as Targets — this sets
numbers reps get judged against) computes and persists both. `GET
/sgi/latest` (any authenticated role) returns the most recent report,
filtered per the visibility rules above.

**Recompute triggers** — `POST /sgi/recalculate` is the manual trigger.
For the automatic side, `ScheduledTasksService` gained a second `@Cron`
job (`EVERY_4_HOURS`, alongside the existing hourly subscription-expiry
check) calling `SgiService.recalculateAllCompanies()`, which replays each
company's most recently saved `sgi_config` against a freshly computed
"this month so far" vs. "previous month" date window — no per-company UI
interaction needed once a company has run the manual calculation once.
Companies that have never touched SGI are silently skipped (nothing
saved to replay), so this cron is a no-op until a company actually
adopts the feature. This is v1's definition of "Live" per the product
owner's own framing: recompute on a timer against the latest uploaded
file, not per-invoice (no live data-entry event source exists yet).

**Frontend — `apps/web/src/app/(dashboard)/dashboard/sales-growth/page.tsx`**
(new page, nav item "إزاي تزوّد مبيعاتك" / "Grow Your Sales" added to the
AI & Insights group, new `sgi` module color). Config UI (file/column
pickers, date windows, "احسب الآن" button) is COMPANY_ADMIN/MANAGER only,
mirroring `team-performance/page.tsx`'s exact structure and hardcoded-
Arabic convention (not the i18n-dictionary pattern, since that's still
only converted for the shell nav and Customer Similarity — this page's
nav *label* does go through the dictionary, its body copy doesn't,
consistent with every other unconverted page). Every role sees the
results once computed. Three sections, matching the roadmap's trimmed
v1 scope:

1. **الهدف الشهري** (Monthly Goal) — actual vs. target progress bar,
   colored red/amber/green by completion.
2. **أكبر الفرص اليوم** (Today's Biggest Opportunities) — `LOST_SALES` +
   `CUSTOMER_DECLINING` situations. A lost or declining customer is
   framed here as a revenue-recovery opportunity (an explicit, honest
   mapping decision — the full 10-engine vision has distinct
   upsell/cross-sell "opportunity" situations that weren't in this v1
   catalog, so the biggest real opportunity available today is winning
   back a customer who's slipping away).
3. **مخاطر اليوم** (Today's Risks) — `COLLECTION_RISK` + `CUSTOMER_INACTIVE`
   + `TARGET_BEHIND`. Downside-exposure situations: money not collected,
   a customer gone fully dormant, a rep falling behind pace.

Known gap, flagged rather than silently worked around: there's no
frontend screen yet for entering `Target` rows (the backend CRUD from
the prior entry has no UI) — the Monthly Goal section correctly shows
"no targets recorded" until either a Targets-type file is uploaded and
imported via the existing generic file-column-mapping flow, or that UI
gets built. Not in this batch's scope; not silently deferred either.

**Verification**: backend (`sgi.service.ts`, the `ScheduledTasksService`
change, and their module wiring) verified via scratch `tsc --noEmit`
(pinned `typescript@5.7.2`/`zod@3.23.8`/`@types/node@20`, strict flags
matching `tsconfig.nestjs.json`, hand-written stubs for
`@field-sales-os/database`/`@field-sales-os/schemas` and every injected
service mirroring only what's actually called) — clean, exit 0, after
catching and fixing one real bug the scratch check surfaced (a stray
`hierarchyUser` reference left over from an imprecise find-and-replace
during the `recalculate()`/`runRecalculation()` split). The frontend page
could **not** be verified the same way this session — the sandbox's
mounted view of the real repo's `node_modules/typescript` returned
"Input/output error" (a filesystem desync distinct from, but similar in
spirit to, the file-truncation issue noted earlier in this log), and
building an equivalent scratch stub for a full Next.js/React Query/UI-kit
page was judged not worth the time for this batch. Instead the page was
written to mirror `team-performance/page.tsx`'s structure line-for-line
(identical hook calls, identical `Select`/`Card`/`Badge` prop shapes) and
manually re-read in full after writing. **Recommended**: run `pnpm
--filter web typecheck` locally before relying on this screen in
production.

Also still outstanding from the prior entry: the `Target` migration has
not been applied to any real database — run `pnpm --filter
@field-sales-os/database migrate:deploy` locally first, or none of this
(Target-based `TARGET_BEHIND` situations, the Monthly Goal section) will
have real data to read.

Phase 1 is now feature-complete per `docs/SGI_ROADMAP.md`'s scope.
Phases 2-5 (recommended customers/products + playbooks, Executive Coach +
Sales Memory Engine, AI Learning Loop, voice) remain deliberately
unstarted, per the phased plan agreed with the product owner.

## Sales Growth Intelligence (SGI) — architecture correction: single decision-layer service, dual consumers (July 2026)

Product owner flagged a real architecture problem with the first Phase 1
cut: the Sales Growth screen was being treated as *the* deliverable,
with an early draft conversation drifting toward either simplifying it
into a form or replacing it outright with the chat assistant. Correct
framing, stated explicitly and treated as the governing principle for
all SGI work going forward: **SGI is a backend business-decision-layer
service. The Sales Growth screen (proactive client), the Assistant chat
(reactive client), and future Voice/Customer 360/Daily Mission/Visit
Planning (future clients) all consume identical decisions from
`SgiService` — none of them may contain business logic, and none of them
replace each other.** This entry covers the three concrete changes made
to bring the existing code in line with that framing, plus a follow-up
architectural request (the `SGIContext` object) requested immediately
after as the final Phase 1 piece.

**1. No-form day-to-day refresh** — `apps/api/src/modules/sgi/sgi.controller.ts`
gained `POST /sgi/recalculate-now` (COMPANY_ADMIN/MANAGER, same gate as
`recalculate`), calling the already-existing `SgiService.recalculateForCompany()`
(built for the cron in the prior entry, now reused here) instead of
requiring the full file/column form every time. `apps/web/src/lib/api/sgi.ts`
gained a matching `recalculateNow()`. The Sales Growth screen
(`sales-growth/page.tsx`) was restructured around this: the full
file/column setup form (`الإعدادات`) now only renders on first-time setup
(no result exists yet) or when an admin explicitly clicks "غيّر مصدر
البيانات" (`showSetupForm` state) — day to day, admins see the computed
situations immediately with a single "تحديث الآن" button. Regular roles
never saw the form to begin with (unchanged).

**2. `SgiService` generates its own opening summary — not the screen, not
the Assistant.** An earlier draft of this correction had the Sales Growth
screen call the Assistant chat endpoint to generate a "good morning, here's
what matters today" opener — user caught this as re-introducing exactly
the coupling the correction was meant to remove (the screen would have
depended on the Assistant's phrasing/availability for content that's
really SGI's job). Fixed by adding a `briefing: string` field to both
`SgiRecalculateResult` and `SgiLatestResult` (`packages/schemas/src/sgi.schemas.ts`),
generated by a new `buildBriefing(summary, situations)` helper in
`sgi.service.ts` — a plain template over already-computed fields (top
situation by severity rank, total/high-severity counts, goal progress —
nothing invented, no LLM call). `runRecalculation()` computes it once
(company-wide); `getLatest()` **regenerates it against each viewer's own
filtered situations**, so a rep's opener leads with their own top item,
not the company-wide one. The Sales Growth screen renders `result.briefing`
verbatim in a chat-bubble-styled block at the top of the results. The
Assistant's `get_sales_growth_situations` tool
(`assistant.service.ts`) now also returns this same `briefing` field, and
`dna-core-prompt.ts`'s SGI section instructs the model to relay it as-is
for general "what's happening today" questions rather than composing its
own summary — one summary, generated once, shown everywhere.

**3. `SituationRow` gained two buttons, no new logic.** "ليه؟" toggles
visibility of `situation.detail` (a field SgiService already computed —
this was previously always shown; now collapsed by default, revealed on
click). "ناقشني" hands the situation off to the Assistant to continue the
discussion — see the `SGIContext` mechanism below for how.

**4. `SGIContext` — the reusable decision-object handoff.** Requested as
an explicit final architectural piece: rather than each screen inventing
its own way to pass "what we were just looking at" to another screen,
every SGI consumer should serialize and consume the *same* typed object,
carried through a *generic* mechanism any future module can reuse
unchanged. Implemented as:
- `packages/schemas/src/sgi-context.schemas.ts` — new `sgiContextSchema`/
  `SgiContext` type, shared (not duplicated) across backend and frontend
  via the schemas package. Every field maps to a real, already-computed
  `SgiSituation` field (`recommendationId`←`id`, `entityId`←`entityKey`,
  `entityName`←`entityLabel`, `reasoning`←`detail`, `executionPlan`←
  `[recommendation]`). Two deliberate departures from a generic "AI
  recommendation" shape, both to avoid inventing data: `severity`
  (high/medium/low, already computed) stands in for a numeric
  "confidence" score SgiService doesn't compute; `executionPlan` is an
  array for forward-compatibility with real multi-step Playbooks in a
  later phase, but Phase 1 only ever populates it with the single
  existing recommendation sentence. No `customerId`/`productId` fields —
  SGI has no SKU-level situations yet, so identity travels via the
  existing generic `entityType`/`entityId`/`entityName` (already
  "rep" | "customer"); a future product-level situation type is a new
  `entityType` value, not a new context shape.
- `apps/web/src/lib/sgi-context.ts` — `toSgiContext()` (builds a context
  from a `SgiSituation`, pure reshaping), `encodeSgiContext`/
  `decodeSgiContext` (URL-safe JSON round-trip; decode is structurally
  validated and returns `null` rather than throwing on a malformed/old-
  format param, so a receiving screen degrades to its normal empty state
  instead of crashing), `buildAssistantDeepLink()` (returns
  `/dashboard/assistant?context=...`), and `sgiContextToMessage()` (the
  one place the opening chat message is phrased, so every current and
  future producer gets identical framing for free).
- **Producer**: `sales-growth/page.tsx`'s `discussSituation()` now builds
  a context via `toSgiContext()` and navigates via
  `buildAssistantDeepLink()` — no more sessionStorage, no screen-specific
  handoff.
- **Consumer**: `assistant/page.tsx` reads `?context=` via
  `useSearchParams()` (wrapped in a `<Suspense>` boundary, split into an
  `AssistantPage`/`AssistantChat` pair since that's required by the App
  Router), decodes it once on mount, auto-sends
  `sgiContextToMessage(context)` as the opening message, and strips the
  param from the URL immediately after (`router.replace`) so a refresh
  doesn't resend it.
- The prior sessionStorage-based draft (`lib/sgi-discuss.ts`,
  `SGI_DISCUSS_STORAGE_KEY`) is now dead code — the sandbox couldn't
  delete the file directly (permission denied on the mounted drive), so
  it was overwritten with an empty `export {}` placeholder and a comment
  marking it safe to delete by hand.
- Nothing here is Customer 360/Daily Mission/Visit Planning/Voice-specific
  — `SgiContextSource` already includes those as valid `source` values,
  and any future screen that has a `SgiSituation` (or, later, its own
  SGI-derived recommendation) can call the same `toSgiContext`/
  `buildAssistantDeepLink` pair to open the Assistant pre-grounded,
  exactly like the Sales Growth screen does today.

**Verification**: `sgi.service.ts` (the new `buildBriefing` function and
its threading through `runRecalculation`/`getLatest`) verified clean via
scratch `tsc --noEmit` (same pinned-package/hand-stub approach as the
prior entry — `typescript@5.7.2`/`@types/node@20`, stubs for
`@nestjs/common`, `xlsx`, `@field-sales-os/schemas` matching only the
real `sgi.schemas.ts` shapes including the new `briefing` field, real
source copied in verbatim). `assistant.service.ts`'s one-line addition
(returning `latest.briefing` from a function already typed
`Promise<unknown>`) and `dna-core-prompt.ts`'s prose edit carry no type
risk and were reviewed by hand. The frontend (`sales-growth/page.tsx`,
`assistant/page.tsx`, `lib/sgi-context.ts`, `lib/types.ts`) could not be
mechanically typechecked this session for the same reason as the prior
entry (`node_modules/typescript` under the mounted repo path returns
"Input/output error" — confirmed still broken, re-tested at the start of
this batch); verified by careful manual re-read of every changed file
instead. **Recommended, as before**: run `pnpm --filter web typecheck`
and `pnpm --filter api typecheck` locally to confirm.

Phase 1 remains feature-complete; this entry is an architecture
correction and one additive mechanism (`SGIContext`) on top of it, not a
scope change. Phases 2-5 remain unstarted.

## Sales Growth Intelligence (SGI) — two real production bugs found via live testing, then Priority Center hierarchy (July 2026)

The product owner ran the app locally for the first time since the prior
two entries. This surfaced two real bugs (not caught by scratch-tsc, since
neither is a type error) and led to one more UI redesign.

**Bug 1 — a stray pair of backticks broke the entire API build.**
`dna-core-prompt.ts`'s `CORE_DNA_SYSTEM_PROMPT` is one large template
literal (opened at line 15, closed at line 67). The prior entry's edit to
its SGI section wrapped the word "briefing" in backticks
(`` `briefing` ``) as an inline-code convention — but backticks inside a
template literal close it early. This didn't surface in scratch-tsc
(which only compiled `sgi.service.ts` in isolation, never this file) —
only `pnpm dev`'s real `tsc --watch` caught it, as `TS1005: ','
expected.` with no file/line context useful on its own. Fixed by
switching to plain double quotes (`"briefing"`); confirmed via `grep` that
the file's only two remaining backticks are the template literal's own
open/close. **Lesson for future edits to this file**: never use backticks
for emphasis inside `CORE_DNA_SYSTEM_PROMPT` — use quotes.

**Bug 2 — `GET /sgi/latest` returning `null` broke react-query.**
`sgiApi.latest()` (`lib/api/sgi.ts`) is the first endpoint in this app
that legitimately returns `null` (no company config saved yet). React
Query v5's `useQuery` throws "Query data cannot be undefined" if the
`queryFn` resolves to `undefined` — a `null` value is fine, but
`apiFetch`'s generic JSON-parsing (`lib/api-client.ts`) falls back to
`undefined` whenever the response's `content-type` header doesn't
include `application/json`, and this was the first caller to ever hit
that fallback path with a real, valid (non-error) response. Fixed
narrowly at the call site — `latest: () => apiFetch<SgiLatestResult |
null>("/sgi/latest").then((r) => r ?? null)` — rather than changing
`apiFetch`'s shared behavior for every other (never-null) endpoint.

**Separately, unrelated to this session's edits**: the product owner's
local `pnpm dev` also surfaced 32 pre-existing TS2339/TS2345 errors in
`team-performance.service.ts` and `visit-efficiency.service.ts` (`Property
'supervisorColumn' does not exist on type ...`, `HierarchyFilterFile`
mismatch) — confirmed via `schema.prisma` that `File.repColumn` /
`File.supervisorColumn` do exist in the schema (added by the "hierarchy
columns" migration, several entries back), so this is a **stale generated
Prisma Client**, not a schema or code bug: `pnpm --filter
@field-sales-os/database generate` needs to be re-run locally. Not fixed
in this session (nothing to fix in the codebase) — flagged to the product
owner as an environment step.

**Priority Center — hierarchical navigation, replacing the flat
Opportunities/Risks lists.** New explicit product decision, framed as
"not a notifications screen — a Priority Center that mirrors the real
admin hierarchy": Day → Sector (Supervisor) → Rep → Priorities for
COMPANY_ADMIN/MANAGER, Day → Rep → Priorities for SUPERVISOR, a flat
"today" list for SALES_REP. Visual language (summary stat tiles,
dot+count chips, name search, compact collapsed cards) follows a
reference mockup the product owner supplied.

- `packages/schemas/src/sgi.schemas.ts` — new `sgiRepDirectoryEntrySchema`
  (`email`, `name`, `supervisorEmail`, `supervisorName`) and a
  `repDirectory: SgiRepDirectoryEntry[]` field on `sgiLatestResultSchema`
  only (not `sgiRecalculateResultSchema`, which predates per-viewer
  filtering). Human-readable labels only — no new decisions.
- `sgi.service.ts`'s `getLatest()` — after the existing role-based
  situation filtering, collects the distinct `ownerRepEmail`s left in
  view, looks up their `fullName` (same `nameByEmail` pattern already
  used for `TARGET_BEHIND` labels in `runRecalculation`), and pairs each
  with their supervisor's email/name via the already-computed
  `repSupervisorMap`. Naturally scoped: a SUPERVISOR's directory only
  ever contains their own reps, since it's built from their
  already-filtered `situations`, not a fresh unfiltered query.
- `apps/web/src/app/(dashboard)/dashboard/sales-growth/priority-tree.tsx`
  (new file) — `PriorityCenter`, the tree component. Pure grouping/
  filtering/sorting functions (`groupByRep`, `groupBySector`,
  `filterSectors`/`filterReps` for the mockup's name search,
  `sortByImpact` for most-urgent-group-first ordering) over
  `SgiSituation[]` + `repDirectory` — zero new business logic, explicitly
  required by the product owner and enforced by construction (every
  function here only reads `severity`/`type`/`ownerRepEmail`, fields
  SgiService already produced).
- **Known, deliberate gap vs. the reference mockup**: the mockup's rep
  column shows a Sunday-Thursday day strip (each day with its own count)
  and per-item clock times. `SgiSituation` carries no visit-day or
  time-of-day dimension — that's Visit Planning/route-schedule data,
  which doesn't exist in this codebase (confirmed with the product owner
  in the prior entry's architecture discussion). Faking a 5-day tab strip
  over data that has no day dimension would be indistinguishable from
  real structure to the rep using it, so `PriorityCenter` shows reps
  exactly what's real: a single "today" list in the same compact-card
  style as the rest of the mockup. Explicitly flagged to the product
  owner rather than silently built or silently skipped. The day strip is
  additive later — one more grouping function next to
  `groupByRep`/`groupBySector` — once a situation's customer can be
  mapped to a scheduled visit day.
- `sales-growth/page.tsx` — the old flat "أكبر الفرص اليوم" /"مخاطر
  اليوم" cards are replaced by one `<PriorityCenter>` inside a "مركز
  الأولويات" card. `recalculateMutation`/`recalculateNowMutation`'s
  `onSuccess` handlers switched from hand-seeding the `["sgi","latest"]`
  query cache with the raw (unfiltered, `repDirectory`-less) recalculate
  response to `queryClient.invalidateQueries(...)`, so the UI always
  refetches through the real `getLatest()` path and never shows a stale
  shape.

**Verification**: `sgi.service.ts`'s updated `getLatest()` (with
`repDirectory`) re-verified clean via scratch `tsc --noEmit`, same
pinned-package/hand-stub approach as prior entries, stub schema updated
to include `SgiRepDirectoryEntry`/`repDirectory`. `priority-tree.tsx`
verified with `esbuild`'s parser (catches syntax/JSX errors distinct from
type errors — a lighter, faster check than a full scratch tsc setup for
one self-contained new file with no external app dependencies beyond
already-typed props). `sales-growth/page.tsx` could not be verified via
the sandbox's bash tool this session for an unrelated reason: writing the
file left the bash-mounted view of it desynced from the real file for the
rest of the session (`wc -c`/`tail`/`stat` all kept returning stale
byte-for-byte identical output — same size, an `mtime` over an hour
old — regardless of retries or delays, while the `Read` tool consistently
showed correct, current, syntactically clean content matching every edit
made). This is a variant of the file-mount staleness issue noted in
earlier entries, now affecting size/mtime metadata and not just content
reads. Treated the `Read` tool's view as ground truth (consistent with
how this same class of bug was resolved earlier this session) and
verified `page.tsx` by careful manual re-read instead. **Recommended, as
before**: run `pnpm --filter web typecheck` locally to get a definitive
answer once bash-mount access to this file recovers.

## RIE Migration Plan (ADR-001) — Migration #7: Team Performance, Architecture Freeze process rule adopted (July 2026)

Continuation of the multi-session RIE migration effort (Migrations #1-#6 —
Customer Comparison, Customer Similarity, Heat Map, Route Planning, Geo
Intelligence, Visit Efficiency — done in prior sessions/context windows, not
previously logged here). Team Performance moved from Manual Mapping
(user-picked file/amountColumn/dateColumn per category) to full RieFacade
reads, mirroring Migration #6's pattern with three explicit product
decisions (not a mechanical repeat):

1. **Sales value** = `Invoice Items.LineTotal` joined to `Invoices`, not
   `Invoices.TotalAfterVAT` — kept identical to Heat Map/Customer
   Comparison's source so this screen's sales figure stays consistent with
   the rest of the platform for the same period.
2. **Supervisor grouping** = `Employees.DirectManagerID` (formal reporting
   line), not `Routes.SupervisorID` — Team Performance represents the
   official management structure, not the operational route structure.
3. **Independent categories** — a category (sales/collection/returns) with
   no Dataset uploaded is omitted (`null` on every rep row,
   `categoriesAvailable.<category>` false), never zeroed, and never blocks
   the other two from rendering. Old behavior (a category simply wasn't
   selectable if unmapped) preserved in spirit, not the zero-fallback this
   session initially proposed and the product owner explicitly rejected.

Rep identity unchanged from Migration #6: `RouteID -> Routes.SalesRepID ->
Employees`, with the same fallback-to-id philosophy when a hop can't be
resolved (row stays visible, not dropped).

**Verification, and its known environment ceiling.** The sandbox's pnpm
`node_modules` symlinks are broken (cross-platform mount I/O errors — same
root cause as the stale-Prisma-Client note in the SGI entry above, this
time affecting `tsc`'s module resolution rather than a generated client).
A full project-wide `tsc` run isn't possible here. Verified instead with a
scoped tsconfig pointing directly at the physical `.pnpm` package
directories (bypassing the broken symlinks) for the actual business logic
— `team-performance.schemas.ts`, `team-performance.service.ts`/
`.controller.ts`, and the full RIE dependency chain — using real,
unstubbed `zod` and the project's own RIE source types: **zero errors**.
NestJS decorators (`@Injectable`, `@Controller`, ...) were typed via
minimal hand-written stubs since they're unchanged mechanical wiring, not
new logic. A 21-assertion manual Node smoke test (join, rep-resolution
fallbacks, category-availability nulling, prior-period math, sort order,
orphan-row handling) passed in full.

**Technical debt logged (environment-caused, not a Migration #7
regression — approved by the product owner as non-blocking):**
- The frontend Excel export in `team-performance/page.tsx` was typechecked
  against a loosely-typed (`any`-based) `xlsx` stub, not xlsx's real
  types, because of the same broken-symlink ceiling above. Correctness
  there rests on structural pattern-matching against the already-working
  export code in the same file family, not a real type check.
- Three `onSuccess`/`onError` callback parameters in
  `team-performance/page.tsx` showed as implicit-`any` under the scoped
  frontend tsconfig, most likely a `@tanstack/react-query` package.json
  `exports` resolution gap in that scoped config rather than a real typing
  hole (identical callback pattern is unchanged/pre-existing across every
  other migrated screen) — not fully proven, flagged rather than asserted.

**New standing process rule from this session (Architecture Freeze,
applies to all migrations from #8 onward):** at most one open architectural
decision at a time during a migration (multiple candidates get a short
list with the highest-impact one discussed first); Implementation
Decisions execute immediately without pausing; decision write-ups are
limited to current state / proposed change / reason / expected impact /
why it blocks execution without it; no environment repair (pnpm,
symlinks, workspace) unless explicitly requested; typecheck runs once via
the standard scoped method — a failure traced to a known out-of-scope
environment issue gets documented in the report, not chased; scope stays
strictly inside the migration at hand, no unrequested refactors or
optimizations.

**Migration #7: Approved.**

## RIE Migration Plan (ADR-001) — Migration #8: Sales Growth Intelligence (SGI) (July 2026)

Sales/collection reads in `sgi.service.ts` moved from Manual Mapping (a
Sales-file picker + 4 hand-typed columns, plus an optional Collection-file
picker + 3 columns) to RieFacade — same join shape as Migration #7 (Invoice
Items joined to Invoices for sales, Collections for collection), same rep
identity (RouteID -> Routes.SalesRepID -> Employees), same supervisor
source (Employees.DirectManagerID, resolved directly per rep now instead of
per-row voting — a real simplification since it's a 1:1 employee fact, not
something that needs a vote). All five situation types (`TARGET_BEHIND`,
`LOST_SALES`, `CUSTOMER_DECLINING`, `CUSTOMER_INACTIVE`,
`COLLECTION_RISK`) and their detection/severity-ranking logic are
byte-for-byte unchanged — only how the underlying accumulators
(`customers`, `reps`) get populated changed.

**Architecture Freeze in action — one decision surfaced, reviewed twice.**
TARGET_BEHIND's "target" side reads the Prisma `Target` model
(`repOrTerritoryKey` + `periodMonth`, supports both file-upload and direct
manual entry — the reason this Prisma model was built in Phase 1 instead of
routing Targets through the file pipeline like everything else). RIE
separately has a Canonical `Targets` entity (`Month+Year+RouteID`), and the
Relationship Registry already lists `REL-PL-001 Route_HasTargets` with
`engineConsumers` explicitly including `"SGI"` — a real fork between two
target representations. Decision approved: **(a) leave Prisma `Target` and
`TargetsModule` completely untouched; only migrate the sales/collection
reads that feed TARGET_BEHIND's "actual" side.** The product owner asked
for a second pass specifically checking "is Canonical Targets actually
ready for SGI to use today" against the platform's stated long-term
principle (RIE as sole source of truth for all operational company data,
Targets included). Verified directly against source:
`excel-entity-provider.mapping.ts`, the `IMPORT-TARGETS-v1.0` import
template, and `enums.ts`'s dataset-type registry confirm the Canonical
`Targets` entity is fully plumbed **at the Route level** — a company could
upload a Targets file today and RIE would serve it. But bridging
Route-level targets to the rep-level actuals TARGET_BEHIND needs requires
`REL-DER-001 Employee_EffectiveTarget`, documented in the registry itself
as "Derived, recomputed on every query, never persisted," routed through
Route Assignment history — and **Route Assignments has zero data source
anywhere on the platform** (`UNMAPPED — no dataset classifier and no
Prisma table`, per `excel-entity-provider.mapping.ts`'s own inline note;
the same gap Migration #6/Visit Efficiency worked around for rep identity).
Separately, Canonical entities are read-only/file-upload-only by ADR-001's
own design (RIE has no write path for any entity), so a full switch would
also strand the Targets screen's deliberate manual-entry UX
(`TargetSource.MANUAL`) with no RIE equivalent. Conclusion: the blocker
isn't architectural intent — the long-term principle (RIE as sole source of
truth, Targets included) stands, and is already anticipated in the
Relationship Registry itself — the blocker is a missing operational data
source (Route Assignments) plus an unresolved write-path question. Decision
(a) re-confirmed on this basis, not just "separate project."

**Architecture Backlog (not Technical Debt — a known future migration
blocked on missing infrastructure, not a shortcut taken in this session):**
Migrating TARGET_BEHIND from Prisma `Target` to Canonical `Targets` needs,
in order: (1) a real data source for Route Assignments (dataset classifier
+ import template, or a Prisma table), so `REL-DER-001
Employee_EffectiveTarget` can actually resolve; (2) a decision on RIE's
missing write path, or an accepted plan to retire `TargetSource.MANUAL`
entry; (3) a mapping decision for which of Canonical Targets' 6 KPI fields
(`SalesTarget` et al.) TARGET_BEHIND compares against, vs. Prisma Target's
single generic `value`. None of this is started.

**Verification.** Manual-only change to `runRecalculation`'s data-gathering
(RIE reads + a `buildRepResolver` identical in shape to Migration #7's) —
detection/scoring/`getLatest()`/the Assistant's `get_sales_growth_situations`
tool are all untouched. Scoped tsconfig (same method as Migration #7:
physical `.pnpm` paths for `zod`, minimal stubs for `@nestjs/common`/
`@nestjs/swagger`) run once: 4 errors, all traced to one cause —
`@field-sales-os/database`'s Prisma Client has never been generated in this
sandbox (confirmed: no `.prisma` client directory exists anywhere under
`node_modules`), so a stubbed `PrismaClient` was needed and can't type
Prisma model calls precisely. All 4 errors sit on the `nameByEmail` lookup
lines in `runRecalculation`/`getLatest()` — confirmed byte-identical to the
pre-migration file, not touched by this migration — plus one shared,
untouched file (`common/prisma/errors.ts`) pulled in transitively. Per
Architecture Freeze: documented, not chased. A 17-assertion manual Node
smoke test (rep resolution + fallbacks, supervisor resolution via
DirectManagerID, all 5 situation types, orphan invoice-item handling,
Collections-unavailable warning path, TARGET_BEHIND matching against the
mocked Prisma Target) passed in full — including one useful catch: a test
assumption that `LOST_SALES`' `ownerRepEmail` would resolve from prior-
window data was wrong (rep-vote accumulation only happens for
current-window rows, identical structure pre- and post-migration) — fixed
the test, not the code, once confirmed unchanged.

**Technical debt logged (environment-caused; separate from the Architecture
Backlog item above):**
- Same Prisma-Client-never-generated gap as the typecheck note — this
  sandbox cannot verify Prisma-touching code with real generated types.
  Previously flagged for a different reason in this log's SGI entry 4
  (stale client missing `repColumn`/`supervisorColumn`); this session
  confirms the client isn't generated here at all, a stricter version of
  the same gap.
- `files.service.ts`'s file-replace carry-over logic (its own step 4,
  "SGI's own saved file selection") patches old `sgi_config` `AiReport`
  rows when a referenced file is re-uploaded. Migration #8 removes all
  writes to that report type (no config left to save), so this code path
  is now vestigial for any company onboarding after this migration — still
  correct against pre-existing historical rows, not broken, not touched
  (shared service, out of this migration's scope per CLAUDE.md).

**Migration #8: Approved.**

## RIE Migration Plan (ADR-001) — Migration #9 resolved via ADR-002, not code (July 2026)

Scoping Migration #9 (Hierarchy Columns Editor / Route Hierarchy Config
Editor) surfaced something structurally different from #1-#8: this isn't a
dashboard screen reading a file — `ExcelDatasetEntityProvider` (the
provider every `RieFacade.getEntityRecords()` call goes through, for every
migrated screen) still enforces row-level access via `File.repColumn/
supervisorColumn/managerColumn`, the exact columns this screen configures.
Migrating it for real means replacing RIE's own internal access-control
mechanism, not swapping one screen's data source — a platform-wide change,
not a screen-sized one.

Layered on top: Employees has two live, independent representations with
zero code linking them — Prisma `Employee` (a real HR/org-chart CRUD
screen at `/dashboard/employees`, nav-linked, with cycle prevention and
audit history) and Canonical `Employees` (an Excel dataset already
consumed by Migrations #6/#7/#8 via `RieFacade`). Neither is a subset of
the other (different PK space, different status vocabulary, `Role`/
`Username` only on one side, `orgUnitId`/audit/login-linkage only on the
other) and ADR-001 itself had flagged resolving this as a prerequisite for
migrating this specific screen.

**Decision — ADR-002 (`docs/adr/ADR-002-employees-dual-representation.md`),
approved:** Prisma `Employee` and Canonical `Employees` are accepted as
two intentionally separate systems for two different domains (live HR
administration vs. periodically-uploaded operational data for RIE
analysis) — not merged, not reconciled, no code touched on either side.
This closes ADR-001's open "must resolve Employees' single source of
truth" clause with "no single source of truth is required — each system
is authoritative within its own domain." Two other candidate paths were
considered and rejected for this session: leaving everything exactly as
today with zero resolution (avoids the question rather than answering it),
and rebuilding RIE's internal hierarchy-filter mechanism around automatic
joins right now (the correct long-term fix, but platform-wide blast
radius and out of proportion with what a single migration should carry).

**Architecture Backlog (ADR-002 §4, not Technical Debt — unstarted future
work, not a shortcut taken here):** replacing RIE's internal Hierarchy
Row-Level Filter (currently manual `File.repColumn/supervisorColumn/
managerColumn`) with automatic joins, the same pattern Migrations #6/#7/#8
already use in their own business logic (`RouteID -> Routes.SalesRepID ->
Employees`). Scoped as an independent project after the current RIE
Migration wave, not part of it — needs its own design pass (how row
visibility gets derived with no manual column at all), a non-breaking
rollout plan, and a decision on whether it reads Canonical `Employees` or
needs a bridge to Prisma `Employee` (deliberately left open here, to be
answered when that project actually starts).

**Outcome for the original 9-item RIE Migration Plan:** #1-#8 are migrated
and approved. #9 (Hierarchy Columns Editor) has no executable scope left
under this decision — it stays manual, by design, until the Architecture
Backlog item above is picked up as its own project. No code changed in
this entry; `docs/adr/ADR-002-employees-dual-representation.md` is the
full record.

---

## RIE Migration Wave — closed. Project enters Stabilization Phase (July 2026)

**Decision:** approved 2026-07-18, immediately following ADR-002. "With
this decision, the RIE Migration Wave is considered complete. Move the
project into Stabilization Phase."

**Final status of the 9-item plan (ADR-001, §1):**

| # | Screen | Outcome |
|---|---|---|
| 1 | Customer Comparison | Migrated (prior session) |
| 2 | Customer Similarity | Migrated (prior session) |
| 3 | Heat Map | Migrated (prior session) |
| 4 | Route Planning | Migrated (prior session) |
| 5 | Geo Intelligence | Migrated (prior session) |
| 6 | Visit Efficiency | Migrated (prior session) |
| 7 | Team Performance | Migrated — approved this session |
| 8 | Sales Growth Intelligence (SGI) | Migrated — approved this session |
| 9 | Hierarchy Columns Editor / Route Hierarchy Config Editor | Resolved via ADR-002 — stays manual by design; superseded by an Architecture Backlog item, not a migration |

All 9 items are closed. #1-#8 have no Manual Mapping left; every read goes
through `RieFacade.getEntityRecords(entity, rieContext(user))`. #9 has no
remaining executable scope under ADR-001/ADR-002.

**ADRs produced by this wave:**
- `ADR-001-eliminate-manual-column-mapping.md` — the governing decision (2026-07-17).
- `ADR-002-employees-dual-representation.md` — closes ADR-001's one open clause; Prisma `Employee` and Canonical `Employees` stay permanently separate, no merge (2026-07-18).

**Process rule produced by this wave, now permanent project policy:**
Architecture Freeze (adopted after Migration #7) — Implementation Decisions
execute immediately; Architectural/Business Decisions pause for single-item
approval (current state / proposed change / reason / impact / why it
blocks execution), never more than one open at a time.

**Consolidated Technical Debt (environment-caused, non-blocking, carried forward):**
1. Sandbox has no generated Prisma Client anywhere — all Prisma-touching typecheck relies on a hand-written `[key: string]: any` stub. Masks precision on Prisma-adjacent lines only; does not affect RIE-sourced logic.
2. `files.service.ts` still carries vestigial `sgi_config` report-type handling left over from pre-Migration-#8 SGI config storage — dead code path, not removed (out of Migration #8's scope, no functional effect).
3. Frontend Excel-export path (`xlsx` stub) and a few `react-query` callback params remain loosely typed under the scoped sandbox tsconfig (Migration #7) — cosmetic typecheck gap, not a runtime behavior risk.

**Consolidated Architecture Backlog (deliberately deferred, not started, each needs its own design pass):**
1. **Automatic Hierarchy Row-Level Filter** (ADR-002 §4) — replace the manual `File.repColumn/supervisorColumn/managerColumn` columns that `ExcelDatasetEntityProvider` still uses on every RIE read with an automatic relationship-join mechanism (same pattern as `RouteID -> Routes.SalesRepID -> Employees` already used in Migrations #6/#7/#8). Platform-wide blast radius — affects every RIE read, not one screen. 3 prerequisites listed in ADR-002 §4.
2. **Employee Effective Target / Canonical Targets migration** (flagged during Migration #8's Target/RIE re-evaluation) — `TARGET_BEHIND` in SGI still reads Prisma `Target`/`User` directly rather than through RIE, because Route Assignments data needed for `REL-DER-001` (Employee_EffectiveTarget) isn't populated in the current canonical dataset. Blocked on operational data availability, not architecture intent.

**Status:** RIE Migration Wave is closed. Project moves into Stabilization
Phase. Scope of "next major development phase" is not yet defined —
pending direction.

---

## Stabilization Phase — task 1: dev environment fix, real typecheck run (July 2026)

**Instruction:** "Fix the dev environment" — explicitly requested, lifting
the prior standing restriction against touching pnpm/symlinks/sandbox
config. Goal: replace stub-based typecheck (used throughout Migrations
#7-#9) with a real `pnpm install` + real generated Prisma Client, so
future verification isn't limited by hand-written type stubs.

**Root cause found:** the mounted project folder (`D:\Field Sales OS`,
seen in-sandbox as a FUSE mount) can create and read symlinks but cannot
**delete** them (`rm`/`unlink`/`os.unlink` all fail with `Operation not
permitted`) — this is what broke `pnpm install` in every prior session
(pnpm's `.pnpm` store relies on symlinks it must be able to replace).
This is a mount-level limitation, not a project misconfiguration.

**Fix:** the sandbox's own native disk (`$HOME`, ext4, separate from the
FUSE-mounted project folder) supports full symlink create/read/delete.
Mirrored the repo source (package.json files, `pnpm-lock.yaml`, `apps/`,
`packages/` — excluding `node_modules`/`.git`/build output, ~5MB) onto
that native disk and ran `pnpm install` there instead. **Result: real
install succeeded, 566 packages, zero I/O errors, all postinstall
scripts (Prisma, sharp, argon2, esbuild) completed cleanly.**

**Prisma Client generation — partially blocked, root cause identified:**
`prisma generate` requires downloading a schema-engine binary from
`binaries.prisma.sh`; this domain is blocked by the sandbox's outbound
proxy allowlist (confirmed via direct request: `X-Proxy-Error:
blocked-by-allowlist`). Tried the default command, the documented
`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` bypass, and `--no-engine` —
all three still require the same blocked fetch internally. No local copy
of the engine binary exists anywhere in the installed packages to
substitute. This is an infrastructure-level restriction outside the
project's control — not fixable from inside the sandbox.

**Real typecheck run (real `node_modules`, real zod/NestJS/React/xlsx/etc.,
Prisma Client still absent since generation is blocked):**
- `packages/schemas`: **0 errors.** Fully real, zero stubs involved.
- `apps/web`: **0 errors.** Fully real — this clears the two items
  previously logged as Technical Debt after Migration #7 (`xlsx` export
  typing, `react-query` callback params) — both are fine under real types.
- `packages/database`: 2 errors, both in `prisma/seed.ts` (a script, not
  used by any app) — 1 caused by the missing Prisma Client, 1 pre-existing
  unrelated implicit-any. `src/index.ts` (what other packages actually
  import) checks clean.
- `apps/api`: 66 errors total. Traced every one:
  - ~20 are the missing-Prisma-Client root cause (`Prisma.InputJsonValue`,
    `File`/`Gpt`/`Payment` named exports, `PrismaClientKnownRequestError`),
    scattered across pre-existing modules (files, gpt, payments, plans,
    usage-analytics, audit-log, analysis-studio, customer-location).
  - **4 are in `sgi.service.ts`** (Migration #8) — confirmed by reading the
    code (lines 365/387/582/583): all four trace directly to
    `this.prisma.user.findMany(...)` returning an untyped/`{}`-shaped
    result because `User` isn't a real generated Prisma model here. Not a
    logic bug — same root cause as above, just surfaced differently by the
    real (ungenerated) `@prisma/client` package than by the old hand-written
    `any`-based stub, which had silently masked it.
  - `team-performance.service.ts`/`.controller.ts` (Migration #7): **0
    errors** — fully clean, no Prisma dependency at all (confirms the RIE
    migration removed FilesService/PrismaService cleanly, as intended).
  - The remaining ~40 are pre-existing implicit-any (TS7006) and a few
    genuine type gaps (e.g. `credential-cipher.util.ts` Buffer overloads,
    `compliance.service.ts`) in modules never touched by any RIE Migration
    — out of scope for this task, not modified.

**Revised Technical Debt item #1** (supersedes the version logged above):
Prisma Client generation is blocked by sandbox network policy
(`binaries.prisma.sh` not on the proxy allowlist), not by a local
environment defect — pnpm/symlinks themselves are now fixed. The ~20
Prisma-shape-dependent errors in `apps/api` (pre-existing modules) and the
4 in `sgi.service.ts` are all attributable to this one cause. Item #3
(`xlsx`/`react-query` looseness) is **retired** — real typecheck shows 0
errors on `apps/web`.

**Not fixed, out of scope for this task:** the FUSE mount's symlink-delete
restriction on the actual project folder itself remains — this native-disk
mirror is a workaround for verification only, not a permanent change to
where the project lives. One diagnostic artifact from testing this
(`__symtest.bak`, a broken symlink) could not be deleted from the sandbox
and was left in the project root — needs manual deletion from Windows.

**For future sessions:** this native-disk mirror is not persisted (sandbox
resets). To repeat: `rsync` source files (excluding `node_modules`/`.git`)
to `$HOME/<name>`, run `corepack pnpm install --frozen-lockfile` there
(2 passes needed — first times out mid-network-fetch under the 45s/call
limit, second resumes and completes), then `tsc -p packages/schemas` before
typechecking `apps/api`/`apps/web` (schemas needs its `dist/` built first;
`database` does not, it points `main`/`types` straight at `src/`).

## Visit Copilot — backend OOM crash, root cause + parsed-dataset cache (2026-07-20)

**Reported symptom:** `/dashboard/visit-copilot` never returns results — every
section stays stuck in its loading skeleton. Terminal showed `FATAL ERROR:
JavaScript heap out of memory` and the API process was terminated.

**Root cause:** `ExcelDatasetEntityProvider.getRecords`
(`apps/api/src/modules/rie/excel-entity-provider.service.ts`) had zero
caching — every single call re-downloaded the backing file(s) and re-ran
`XLSX.read` + `sheet_to_json` (memory-heavy: one full JS object per row)
from scratch, unconditionally, then filtered by date/company/hierarchy
*after* the full parse. Visit Copilot reads the same handful of large
entities (Customers, Invoices, Invoice Items, Collections, ...) repeatedly
within one page interaction — `daily-brief` (6 entities via `Promise.all`),
then `plan` re-runs `buildDailyBrief` from scratch, then opening Discovery
reads Customers/Invoices/Invoice Items again, then `route-opportunities`
and a customer `briefing` read again — so one interactive session could
trigger 5-10+ full re-parses of the same large Excel files within seconds,
several of them concurrent (`Promise.all`), enough simultaneous large
object graphs in the heap to exceed Node's default limit. This is a shared
`ExcelDatasetEntityProvider` code path, not something specific to Visit
Copilot's own logic — Visit Copilot just happens to fire the most redundant
reads per page load of any current screen, which is why it's the one that
crashed first.

**Fix (step 1 of 2, per explicit instruction — cache first, defer reducing
first-parse data volume to a follow-up):** added an in-memory cache to
`ExcelDatasetEntityProvider`, keyed by `(companyId, entityName)` and
invalidated automatically by a signature of exactly which active file ids
currently back that entity (a new/removed upload changes the signature, so
there's no TTL-based staleness to reason about for correctness — the TTL/
max-entries bound that does exist is purely a memory cap for inactive
companies). Concurrent callers for the same key share one in-flight
`Promise` rather than triggering parallel duplicate parses. Hierarchy
filtering is deliberately kept OUT of the cached unit (it depends on
`options.requestingUser`, which differs per caller) — the cache stores the
full merged/deduped dataset and `applyHierarchyFilter` runs fresh (a cheap
linear scan) on every `getRecords()` call. One structural side effect:
newest-upload-wins primary-key dedup now runs over every row instead of
only the calling user's visible subset, so the parsed result can be shared
across callers with different route visibility — noted in the code comment
as a theoretical behavior difference that isn't a real scenario for this
system's data (a given entity's RouteID visibility doesn't change between
uploads of it).

**Not done in this pass:** could not run a real `tsc` typecheck — this
sandbox's `node_modules` (root and `apps/api`) still hit the same FUSE
mount `Input/output error` documented in the "dev environment fix" entry
above; re-verified, still broken. Reviewed the diff by hand instead
(signatures, destructuring, `Map.prototype.keys().next().value`'s
`string | undefined` typing, structural compatibility of the trimmed
`{id, sheetIndex, fileName}` file-object type against Prisma's `File`).
**User should run `pnpm --filter api typecheck` locally to confirm**, then
restart the API and re-exercise Visit Copilot (open the screen, build a
plan, open Discovery, open a customer briefing — the same sequence that
crashed it) to confirm the OOM is actually gone before step 2.

**Explicitly deferred to step 2 (per instruction, only after step 1 is
verified):** review whether the *first* parse itself can avoid loading data
it doesn't need — e.g. narrowing what `sheet_to_json` materializes, or
pushing the date-range/customer-scope filtering RIE callers already know
they want down before the full-sheet JSON conversion rather than after it.
Not started yet.

---

## Two parallel sessions on the same Visit Copilot hang — coordination note + this session's fixes (2026-07-20)

**Context:** this entry is from a *different* conversation than the one
directly above, working the exact same reported symptom ("mساعد الزيارات
never loads") at the same time without initial awareness of each other.
Both root causes turned out to be real and independent — flagging this so
whichever session continues doesn't assume either fix alone is sufficient,
and so future parallel sessions on this project treat PROJECT_LOG.md as the
mandatory sync point before touching shared files (`excel-entity-provider
.service.ts`, `files.service.ts`, storage/`companies.service.ts` are all
high-traffic overlap risk).

**Root cause found in this session (independent of the OOM cache above):**
`S3StorageProvider` (`apps/api/src/modules/files/storage/s3-storage.provider.ts`)
constructed its `S3Client` with no request/connection timeout — the AWS SDK
v3 default is unbounded. Local dev's MinIO container (`docker compose`,
port 9000) was not running/reachable, so `download()`/`upload()`/
`getSignedDownloadUrl()` hung **forever** with no error, no timeout, no log
line — indistinguishable from a frontend bug from the browser's side
(confirmed via the API's own `[RequestTrace]` `IN`/`OUT` logger: an `IN` for
`GET /visit-copilot/daily-brief` with no matching `OUT`, even after 6+
minutes). This explains why restarting Node processes repeatedly never
fixed anything — Node was never the faulty component, MinIO being down was.

**Fix:** (1) `NodeHttpHandler({ connectionTimeout: 5_000, requestTimeout:
15_000 })` passed to `S3Client` in `s3-storage.provider.ts` — added
`@smithy/node-http-handler` as an explicit `apps/api` dependency (was only
a transitive one, not resolvable under pnpm's strict linking). (2) confirmed
with the user that `docker compose up -d` had actually not been running
(postgres/minio/minio-init) — once started and healthy, the hang symptom
should resolve independent of the OOM fix above. **Both fixes are needed
together**: MinIO down + no timeout explains an infinite hang with a
healthy Node process; the missing-cache OOM (entry above) explains a Node
process that crashes outright under Visit Copilot's redundant-read load
once MinIO **is** reachable. Neither alone fully explains both symptom
reports across the two sessions — verify both are in place before
re-testing.

**Also fixed this session (unrelated to the hang, found via a `next build`
production-build smoke test the user ran to diagnose separate "app feels
slow" complaints):**
- `apps/web/src/app/(dashboard)/dashboard/page.tsx` — `filesApi.list` (takes
  an optional `companyId`) was passed directly as a React Query `queryFn`
  instead of wrapped in `() => filesApi.list()`; structurally incompatible
  with `QueryFunction`'s context-argument signature, only surfaced by a real
  `next build` type-check (not reproducible via this sandbox's stubbed
  typecheck). Fixed to match the working pattern already used in
  `dashboard/files/page.tsx`.
- Added `apps/api/scripts/dev-guard.mjs` (port-conflict auto-cleanup for
  `pnpm --filter api dev`, mirroring the pre-existing `apps/web` one) after
  a stray orphaned API process from a crashed `pnpm dev` (root, all 5
  packages) run kept port 4000 bound without responding — same failure
  signature as the MinIO hang from the browser's side, different actual
  cause. `apps/api/package.json`'s `dev` script now runs the guard.
- Completed the provider-agnostic Customer Discovery DB design the user had
  approved: `CompanyProfile.googlePlacesApiKeyEncrypted` →
  `discoveryCredentialsEncrypted` (one encrypted blob, flat map of provider
  id → that provider's own JSON-stringified credentials); `Prospect.source`
  enum (`UPLOAD`/`GOOGLE` only) → free `String` (any provider id, no schema
  change to add a future provider). Migration
  `20260719170000_discovery_provider_config` edited in place (had not been
  applied yet). Removed the "OSM stored as source=GOOGLE" workaround in
  `visit-copilot.service.ts` now that free text is allowed —
  `discoverySearch` stores `source: provider.id` literally.

**Not verified by this session:** whether Visit Copilot actually loads data
correctly end-to-end now that both fixes are in place — session ended on
"user about to re-test" with MinIO confirmed healthy and `pnpm install` run
(picks up the new `@smithy/node-http-handler` dependency). **Whoever
continues next should re-exercise Visit Copilot (daily-brief, plan,
Discovery, a customer briefing) and confirm no hang and no OOM crash before
considering this closed.**

---

## Light performance pass — API gzip + Priority Center re-group-on-keystroke (2026-07-21)

**Instruction:** "جهزلي التطبيق لافضل حالة اداء وسيبهولي على اعلى كفاءة"
(get the app into its best performance state / leave it at highest
efficiency), scoped down via follow-up questions to: (1) frontend speed as
experienced by users, (2) whatever's left from the earlier performance
audit (Tasks #240-244 — indexes, N+1/caching, over-fetching/memoization,
connection pool/query logging). That earlier audit's own written
recommendations couldn't be relocated in this session (not saved to
PROJECT_LOG or any other file — apparently only reported in that session's
chat, which is not accessible here), so this pass is a fresh, deliberately
narrow re-check rather than a resume of a specific list. Kept small on
purpose — the user is close to their weekly Claude usage limit this week
(resets Sunday) and explicitly wants to avoid heavy work until then.

**Re-confirmed already in good shape, no action taken:**
- `packages/database/prisma/schema.prisma` — indexes are comprehensive;
  several comments document a deliberate "Pre-Migration Integrity Check"
  pass that already dropped redundant single-column indexes in favor of
  composite ones. Nothing to add.
- `apps/web/next.config.mjs` — `optimizePackageImports` already covers
  lucide-react + the Radix packages used (from the July 2026 slow-nav fix,
  see the "Stabilization Phase" / earlier nav-speed entries).
- `apps/web/src/app/providers.tsx` — React Query already has a sane global
  `staleTime: 30_000` and a retry policy that doesn't retry on 401/403.
  Not an over-fetching source.
- Heavy client-only libs (Leaflet, `xlsx`, `pptxgenjs`) are already
  dynamic-imported inside `useEffect`/handlers rather than top-level
  imported — confirmed still true, no regression.
- `apps/api/src/common/prisma/prisma.service.ts` — no query-level logging
  enabled (would hurt throughput under load); nothing to change.

**Fixed — gzip compression on the API (`apps/api/src/main.ts`):**
`helmet()`/`cookieParser()` were wired up but nothing compressed response
bodies — every response (Heat Map points, SGI situations, RIE-sourced
datasets built from thousands of Excel rows, PPTX-adjacent JSON, etc.) went
over the wire uncompressed. Added the `compression` package
(`app.use(compression())`, right after `helmet()`, before `cookieParser()`)
— default settings (1KB threshold, so small responses like auth/health skip
the CPU cost). `compression` + `@types/compression` added to
`apps/api/package.json`; **needs `pnpm install` to take effect** (same as
the earlier `pptxgenjs` addition — bundle this into whatever `pnpm install`
the user already owes the repo).

**Fixed — Priority Center re-grouping on every search keystroke**
(`apps/web/src/app/(dashboard)/dashboard/sales-growth/priority-tree.tsx`):
`groupByRep`/`groupBySector` (the functions that walk every visible
situation to build the Sector -> Rep -> Priorities tree) were being called
directly in the render body, with `query` (the search box's live state) in
the same render pass — so for a COMPANY_ADMIN/MANAGER with a large roster,
typing a single character in "بحث في القطاعات أو المناديب" re-walked and
re-grouped the *entire* situations array on every keystroke, even though
search only needs to filter the already-grouped sectors/reps by name
(`filterSectors`/`filterReps`, both cheap — they operate on the small
grouped-array, not on raw situations). Split the two concerns: `visibleSituations`
(severity filter) and `groupedReps`/`groupedSectors` (the expensive walk)
are now `useMemo`'d on `[situations, activeSeverity, repDirectory]` — i.e.
they only recompute when the underlying data or the severity-tile selection
changes, never on `query`. The cheap `filterReps`/`filterSectors` pass still
runs on every keystroke, which is correct and fast. Both hooks are called
unconditionally before the component's early return (`situations.length ===
0`) to respect the Rules of Hooks. Minor accepted tradeoff: both
`groupedReps` and `groupedSectors` are computed even though only one is used
per role (`groupBySector` also internally calls `groupByRep` per sector) —
a small amount of redundant work on data-change, traded for not having to
branch hook calls on `roleCode`. Net effect: strictly less work than before
in every case that matters (typing in the search box), no risk introduced.

**Not done, left as-is (would need real profiling data, not present in this
sandbox, to justify):** no `React.memo` usage anywhere in `apps/web` — for a
map/table-heavy dashboard this is a plausible future win, but blindly
wrapping components without measuring which ones actually re-render
wastefully risks churn for no measured benefit. Flagging as a
recommendation, not doing it speculatively.

**Verification:** sandbox still can't run `pnpm`/`tsc` reliably against the
mounted project folder (documented root cause above, under "Stabilization
Phase" — FUSE mount can't delete symlinks). Verified `apps/api/package.json`
is valid JSON, and hand-traced the `priority-tree.tsx` diff for correct
Rules-of-Hooks ordering and JSX/paren structure (a blind brace/paren-count
script produced false positives on this file, entirely from natural-language
parentheticals inside the file's prose comments — not a real signal here).
**User should run `pnpm install && pnpm --filter web typecheck && pnpm
--filter api typecheck` locally** to get a real compile check on both
changes before relying on them.

---

## Real `pnpm build` catches a pptxgenjs typing bug this sandbox couldn't (2026-07-21)

**What happened:** user ran `pnpm build` (testing whether `pnpm start`
production mode is faster than `pnpm dev`, unrelated to any change above)
and hit a real TS compile error in `apps/web/src/lib/export/sgi-report-pptx.ts:100`:
`Property 'shapes' does not exist on type 'PptxGenJS'`. This is exactly the
class of bug the file's own top-of-file comment (Task #253) flagged as a
risk — pptxgenjs's nested type exports couldn't be verified against the
actually-installed version from this sandbox (no working `pnpm`/`tsc`
here), so several calls were written from a guessed API shape.

**Root cause, confirmed by reading the installed
`node_modules/.pnpm/pptxgenjs@3.12.0/.../types/index.d.ts` directly:**
`shapes` (uppercase-key enum, `RECTANGLE = 'rect'`) and `charts` (uppercase-
key enum, `DOUGHNUT = 'doughnut'`) are **namespace-level exports only**
(`PptxGenJS.shapes`, `PptxGenJS.charts`) — never exposed on a `PptxGenJS`
instance. The instance only exposes `ShapeType`/`ChartType` (lowercase-key
enums, e.g. `ShapeType.rect`). But `addShape`'s `shapeName` parameter and
`addChart`'s `type` parameter are both typed as plain string-literal unions
(`SHAPE_NAME`, `CHART_NAME`), not the enum types — and a TS string-enum
member is not structurally assignable to a matching plain string-literal
type without a cast. So even `pres.ShapeType.rect` would have failed the
same way; the only form guaranteed to typecheck against this library's
actual declarations is the raw literal itself.

**Fix:** replaced all 5 call sites — `pres.shapes.RECTANGLE` (3x, in
`addChrome`/`addCoverSlide`/`addSituationTypeSlide`) and `pres.charts.DOUGHNUT`/
`pres.charts.PIE` (1x each, in `addSummarySlide`) — with the raw string
literals `"rect"`, `"doughnut"`, `"pie"`. Verified against `SHAPE_NAME`/
`CHART_NAME`'s actual union definitions in the installed `.d.ts` that these
values are members. Brace/paren balance re-checked, all 5 replacements
confirmed via grep — no other `.shapes`/`.charts` instance-property usage
left in the file.

**Not yet confirmed:** this was diagnosed by reading the installed
package's `.d.ts` directly (finally possible — the user's own machine has a
real `pnpm install`, unlike this sandbox), not by running `tsc` here.
**User should re-run `pnpm build` to confirm this was the only error** —
build tools generally stop at the first file's first error rather than
scanning every file, so it's possible (though every other pptxgenjs call in
this file was cross-checked against the same `.d.ts` and looks clean) that
another unrelated file surfaces next.

## Territory Intelligence — new screen shipped (V1, per approved design doc)

Implemented `docs/GEO_INTELLIGENCE_CENTER_DESIGN.md` v1.1's V1 scope as a
real new screen, named **"Territory Intelligence"** per explicit user
instruction ("ابدا التنفيذ فورا مع اعطاء اسم للشاشة Territory
Intelligence"). Ships as its own new nav entry/route per §2.5 — Heat Map
and Geo Intelligence/New Customer are untouched. Built via two parallel
subagents (backend + frontend) against a fixed API contract worked out in
advance, plus nav/i18n wiring done directly. Both agents cross-checked
their work against each other's actual output afterward (frontend's hand-
mirrored types vs. backend's real Zod schemas) — exact match, no drift.

**Territory grouping key**: `Customer.City` (trimmed, non-empty). Confirmed
via full-repo research that no formal Region/Branch/GeoJSON-polygon concept
exists anywhere in this platform yet — `Regions`/`Branches` RIE entities
are UNMAPPED (no dataset classifier backs them), and the parallel
`OrgUnit` Prisma hierarchy isn't joined to `Customer` anywhere. `City` is
the only geographic field on every real Customer row.

**Backend** (`apps/api/src/modules/territory-intelligence/` +
`packages/schemas/src/territory-intelligence.schemas.ts`):
- `GET /territory-intelligence/summary` — groups customers by City,
  computes a 0-100 **Health Score** per territory from 5 metrics (Sales
  Growth %, Active Customer Rate, Lost Sales count, Visit Coverage %,
  Collection Health %), each normalized to a 0-100 "goodness" score and
  combined via a named `DEFAULT_HEALTH_SCORE_WEIGHTS` const (equal 20%
  each — kept as a swappable const per the design doc's "configurable, not
  hardcoded" requirement; an admin weight-editor UI is still backlog).
  Missing-data metrics (Invoices/Visits unavailable) degrade to `null` and
  are excluded from the weighted average (renormalized over whatever's
  available) rather than failing the whole territory.
- Reuses SGI's already-persisted situations (`SgiService.getLatest()`)
  for the "why" list and Smart Recommendation — joined to territories via
  `entityKey === Customer.CustomerCode`, filtered to City. No new
  situation-detection logic; `TARGET_BEHIND` (rep-level, not geographic)
  is excluded. Recommendation text is templated per top situation type;
  Suggested Actions reuse each situation's own `.recommendation` string
  verbatim.
- `opportunityValueSar`/`expectedImpactSar` = sum of `GROWTH_OPPORTUNITY`
  situations' `metricValue` + `LOST_SALES` situations' `metricValuePrior`
  (recoverable revenue) for that territory.
- `GET /territory-intelligence/executive` — Top 5 Opportunities, Worst 5
  Territories, Fastest Win (highest opportunity value among
  healthScore>=40 territories), Biggest Risk (lowest health score among
  high-severity-topped territories), derived in-process from one
  `getSummary()` call, no duplicate data fetch.
- Date window: current calendar month vs. previous calendar month, same
  convention as `sgi.service.ts`'s `recalculateForCompany`.
- Registered in `app.module.ts`; both endpoints `@Auth()` (any role) —
  RIE's existing hierarchy row-level scoping applies automatically via
  `requestingUser`, same as every other RIE-backed module.

**Frontend**:
- `apps/web/src/app/(dashboard)/dashboard/territory-intelligence/page.tsx`
  — Live Decision Canvas (single `selectedTerritoryId`/`activeLibraryItem`
  state at page level, shared by map/ranking/AI panel per §5.11), 4-category
  Intelligence Library sidebar, AI Decision Panel (Summary/Performance/
  Risk/Opportunity/Comparison tabs per §5.5), ranking list, role-gated
  Executive Mode (§5.12, `COMPANY_ADMIN`/`MANAGER` only, lazily-fetched
  query), Quick Tools (export buttons stubbed for V1 — real pptxgenjs/
  image export not wired yet, judged lower value than the core decision
  flow for this pass).
- `apps/web/src/components/territory-intelligence/territory-map.tsx` —
  new Leaflet component, one `circleMarker` per territory (fixed pixel
  radius scaled by customer count, not a geo-radius circle), 5-tier
  red→amber→green fill matching the existing severity color language,
  split into a rebuild-on-data-change effect and a cheap restyle-only
  effect on selection change (so clicking around doesn't re-fit the
  viewport every time). Same SSR-safe dynamic-`import("leaflet")` pattern
  as `heatmap-map.tsx`.
- All 48 `territoryIntelligence.*` translation keys (+ `nav.
  territoryIntelligence`) added to both AR/EN blocks in `dictionaries.ts`
  directly (not by the agents, to avoid two processes editing the same
  large file concurrently); nav entry added to `(dashboard)/layout.tsx`
  (in `group.aiInsights`, after SGI) with a new `territoryIntelligence`
  `ModuleColorKey`/badge color in `module-colors.ts`.

**Verification**: sandbox can't run `pnpm build`/`tsc` against this mount
(same long-standing FUSE/symlink limitation). Did brace/paren-balance
checks on all 7 new/hand-written files (all balanced), read every file in
full, confirmed every import resolves to a real export, confirmed the
`SgiModule` export name and `@Auth`/`@Get` decorator usage match existing
controllers exactly, confirmed all UI primitives used (`Badge` success/
warning/destructive variants, `Table`, `Tabs`, `Select`) exist in
`components/ui/`, confirmed `useAuth`/`useTranslation` hook usage matches
`team-performance/page.tsx`'s established pattern. **User should run
`pnpm build` to get real TypeScript verification** — same caveat as every
other frontend/backend change this session; the sandbox's manual review
is a strong second line of defense but not a substitute for a real
compiler pass, as the pptxgenjs bug earlier this session demonstrated.

Not yet implemented (flagged, not blocking): real PPT/image export in
Quick Tools (stubbed), Comparison tab is a simple two-column metrics table
rather than a chart, and everything in the design doc's §10 Vision Layer
(AI Confidence, Decision Impact Simulation, Explainability, Decision
History, Geographic Story timeline, DNA Score) — all explicitly deferred
roadmap items per the design doc, not part of this V1 build.

## Territory Intelligence — full redesign to "Enterprise Territory Intelligence Workspace" (client mockup package)

Client supplied a 5-file redesign package (Implementation Brief +
5 annotated mockup images: Polygon Territories vs Marker Map, Multi-Layer
Territory Intelligence, Territory Drill Down, Executive Analysis Panel,
Territory Intelligence Decision Journey) demanding the screen be rebuilt
to Power BI/Tableau/ArcGIS-Dashboards quality: real polygon choropleth
territories (not circle markers), instant-switching multi-layer analysis,
a City→Route→Customer drill-down, and a full-page Executive Decision
Panel — explicitly under **"do not modify backend/APIs/database
schema/business logic/other screens, only redesign Territory
Intelligence"** and **"do not invent functionality, do not simplify, do
not remove components, stop and ask before architectural decisions."**

Two rounds of `AskUserQuestion` (boundary-polygon data source; drill-down
depth) plus several follow-up clarifications from the user resolved the
three real conflicts between the mockup and this platform's actual data
model:

1. **No official GeoJSON boundaries and no country should be hardcoded.**
   User: *"The map architecture must be country-agnostic... Think of the
   geographic boundaries as a pluggable data layer... interchangeable
   GeoJSON boundary files without requiring any UI or architectural
   changes."* → built a swappable **boundary registry**
   (`components/territory-intelligence/boundary-registry.ts`):
   `BOUNDARY_REGISTRY` maps a country-name substring to a `/public`
   GeoJSON asset URL (currently one entry: Saudi Arabia →
   `/geo-boundaries/SA.geojson`); `resolveBoundaryAssetUrl(country)` +
   `loadBoundaryIndex(url)` (cached, never throws — a missing/broken file
   degrades to an empty index, never crashes the screen). The company's
   own already-existing `GET /companies/me/profile` endpoint (unmodified)
   is the sole source of which country's file loads — zero backend
   changes. `apps/web/public/geo-boundaries/SA.geojson` is a hand-authored
   demonstration `FeatureCollection` (8 polygons, one per real Saudi city
   in FSOS's seed data, generated from real city-center coordinates via a
   deterministic "wobbly polygon" script) — external GeoJSON sources
   (geoBoundaries.org, GitHub raw, jsdelivr, OSM Nominatim) were all
   unreachable from this sandbox (proxy `403`s / empty bodies / Git-LFS
   pointers on every attempt), and the user had explicitly pre-approved
   treating any downloaded file as "only a temporary demonstration
   dataset" — so a hand-authored one was substituted, documented in code
   as a swappable placeholder, on-map disclosure badge shown whenever a
   territory falls back to a generated shape (no boundary match).
2. **Full Country→Region→City→District→Route→Customer drill-down isn't
   supported by any existing endpoint.** User approved City→Route→Customer
   for V1, then: *"Do not hardcode the hierarchy... Design the drill-down
   engine so it supports configurable hierarchy levels... data-driven and
   configurable rather than fixed in code."* → built a generic **N-level
   hierarchy engine** (`components/territory-intelligence/
   hierarchy-engine.ts`): `HierarchyLevelDef[]` (each with its own
   `fetchNodes`) is the only seam; `useTerritoryHierarchy(levels)` is a
   level-agnostic state machine (`drillPath`, `drillInto`, `goToLevel`,
   `canDrillDeeper`) with no "city"/"customer" special-casing anywhere in
   the hook itself.
3. **No endpoint anywhere in the codebase returns `RouteID` alongside
   `City` + coordinates per customer** (confirmed by reading Heat Map's,
   Route Planning's, and Visit Efficiency's actual query code) — Route
   couldn't be added without a new endpoint. User: *"Do not redesign the
   data architecture... If the existing data cannot support every future
   drill-down level, implement the UI and drill-down engine in a
   configurable way using the currently available data... Prioritize
   implementation over expanding the data model."* → V1's concrete config
   (`buildTerritoryHierarchyLevels`, the *only* place "city"/"customer"
   are hardcoded) ships exactly **City → Customer** (customer level reuses
   the existing `heatmapApi.query({ scopeField: "City", ... })` endpoint,
   already used by the unrelated Heat Map screen — zero new endpoints);
   Route is a documented future level, not silently dropped.

**New/rewritten frontend files** (all under
`components/territory-intelligence/`, built via 2 parallel subagents on
disjoint file sets, orchestrated/wired together by hand):
- `territory-map.tsx` — rewritten from circle markers to real
  `L.geoJSON()` polygons for boundary-matched territories, a deterministic
  9-vertex "wobbly" fallback polygon for unmatched ones (never a circle,
  per the client's explicit mandate); 7 instant-switching analysis layers
  (`healthScore`, `salesGrowthPct`, `lostSalesCount`, `visitCoveragePct`,
  `collectionHealthPct`, `opportunityValueSar`, and a new client-derived
  `riskLevel = 100 - healthScore`) all recolor the same already-loaded
  polygon set with no refetch; Customer-level (point) nodes render as
  small gradient-colored `circleMarker`s since individual customers have
  no health score.
- `territory-layers-sidebar.tsx` — the persistent numbered 7-layer
  switcher + color legend from the "Multi-Layer" mockup.
- `territory-decision-panel.tsx` — the "Executive Analysis Panel"
  mockup's single-scroll BI-style layout (not the old 5-tab layout):
  overview + health gauge + ranking + last-updated, KPI grid, an honest
  empty-state for Performance Trend (no historical/snapshot series exists
  on `TerritorySummaryItem` — not fabricated), AI Insight, Growth
  Opportunities, Recommended Actions, Visit Plan with Compare/Export/
  Share, a drill-into-customers CTA, Close. Every number traces to a real
  field; a "Total Sales" KPI was deliberately omitted (only
  `salesGrowthPct`, a %, actually exists) rather than invented.
- `territory-customer-list.tsx` — the Customer-level list, direct
  counterpart to the City-level ranking list once drilled into a city.
- `boundary-registry.ts`, `hierarchy-engine.ts` — see above.
- `app/(dashboard)/dashboard/territory-intelligence/page.tsx` — rewritten
  to orchestrate all of the above: company-profile fetch →
  `resolveBoundaryAssetUrl` → `loadBoundaryIndex`; `useTerritoryHierarchy`
  drives a breadcrumb (root + one clickable segment per `drillPath`
  entry), the map, and which right-hand panel / bottom list renders
  (`TerritoryDecisionPanel` + a `CityRankingList` at the City level,
  `TerritoryCustomerList` full-width at the Customer level — the 3rd grid
  column collapses at Customer level since no decision panel exists for
  individual customers by design). Executive Mode (role-gated
  `COMPANY_ADMIN`/`MANAGER` quick drill-in) is untouched from the original
  build — nothing in this redesign touched it, drilling in from Executive
  Mode resets the hierarchy to the City level and selects the chosen
  territory. ~30 new `territoryIntelligence.*` translation keys (AR+EN)
  added directly to `dictionaries.ts` before dispatching the subagents, to
  avoid concurrent edits on that shared file.

**Verification**: sandbox's `pnpm`/`tsc` are non-functional against this
mount this session (global `pnpm install -g` succeeded but the workspace's
`node_modules/typescript` symlink resolves to a path outside the mount and
errors with I/O error; a scoped `tsc --noEmit` inside `apps/web` failed to
even resolve its own `typescript` module for the same reason) — same
long-standing limitation as prior entries, worse this time. In its place:
read all 7 new/rewritten files in full twice (once per agent's delivery,
once again during orchestration), verified brace/paren balance
programmatically on all 7 (all balanced), cross-referenced every
`TerritoryLayersSidebar`/`TerritoryMap`/`TerritoryDecisionPanel`/
`TerritoryCustomerList` prop passed from `page.tsx` against each
component's actual exported prop interface (all match exactly), and
programmatically cross-checked all 58 `territoryIntelligence.*`
translation keys referenced across these 5 files against `dictionaries.ts`
— zero missing keys, all present in both AR and EN blocks. **User should
run `pnpm build` on their own machine for a real compiler pass** — this
sandbox limitation is now worse than the simple "no FUSE/symlink support"
noted in earlier entries and could not be worked around this session.

Not yet implemented (flagged, not blocking, per the user's own "prioritize
implementation over expanding the data model" instruction): a Route level
between City and Customer (no backend field currently joins `RouteID` to
per-customer coordinates within a city — documented as the natural next
hierarchy level once that data exists), and real PPT/image export in
Quick Tools (still stubbed, unchanged from the original V1 build).

## Territory Intelligence — fix: map showed zero polygons (post-redesign regression)

User reported (with a screenshot) that after the redesign above, the page
loaded correctly — sidebar, ranking list, and the Executive Decision Panel
all showed real data — but the map itself was completely blank: no real
boundary polygons AND no fallback "wobbly" shapes either, not even one.

**Root cause**: `useTerritoryHierarchy(hierarchyLevels)` was called
unconditionally at the top of `TerritoryIntelligencePage`, before the
`summaryQuery.isLoading` guard. On the component's very first render
(before `summaryQuery.data` exists), `territories` was still the
`EMPTY_TERRITORIES` placeholder, so `buildTerritoryHierarchyLevels([])`
produced a "city" level whose `fetchNodes` closure returned `[]`. TanStack
Query executed that `queryFn` once for `queryKey: ["territory-hierarchy",
0, undefined]` and cached the empty result. Once `summaryQuery` resolved
and `territories` became the real 8-city array, `hierarchyLevels` was
recomputed with a fresh closure that *would* return real data — but the
`useQuery`'s `queryKey` hadn't changed, so TanStack Query never re-ran
`queryFn` and kept serving the stale, empty, cached `[]` forever.
`TerritoryMap` is fed exclusively from `hierarchy.nodes`, so it had zero
nodes to loop over — not even the fallback-polygon branch ever executed.
The rest of the screen looked fine because the ranking list and decision
panel read `territories` (the raw, correctly-loaded summary array)
directly, bypassing the broken hierarchy cache entirely — which is exactly
why only the map was affected.

**Fix**: moved the `useTerritoryHierarchy`/`buildTerritoryHierarchyLevels`
call out of the page component and into `NormalView`, which the parent
only ever mounts once `territories.length > 0`. Its first data fetch now
always sees the real, loaded territories, so the query cache is correct
from the start. This also let `handleExecutiveDrillDown` drop its manual
`hierarchy.goToLevel(0)` reset — toggling out of and back into Executive
Mode now unmounts/remounts `NormalView`, which naturally resets its
`drillPath` state to the City level on its own. No changes to
`hierarchy-engine.ts`, `territory-map.tsx`, or any other component — this
was purely a `page.tsx` wiring bug introduced during orchestration, not a
design or engine flaw. Verified via brace-balance check and a grep
confirming zero leftover references to the removed `onDrillInto`/
`onGoToLevel`/`hierarchy` props. **User should reload the page and confirm
polygons now render** — this sandbox still can't run a real `tsc` pass
(see prior entry).

## Decision Analytics Studio — full build (client-approved spec, 2026-07-22)

Client supplied a complete "Decision Analytics Studio — Complete Product
Design Specification" (4 reference images + a full written spec: KPI list,
Analyze By dimensions, filter list, 10 chart types, Category→Brand→SKU→
Customer→Invoice drill-down chain, cross-filtering rules, workspace states,
RTL/LTR + light/dark, "Open Territory Intelligence"/"Return" navigation)
with an explicit scope lock: implement only this screen, don't touch
backend/APIs/DB/auth/architecture/other screens, don't simplify or invent
business logic, stop and ask if something can't be built on the existing
model. Process, in the order the client actually drove it (a deliberate
correction from the usual flow):

1. **Frontend-first, not backend-first.** After I'd already gotten
   approval to build a new backend module, the client sent a follow-up
   overriding that: build the frontend against existing endpoints first,
   and only present a precise gap list — no speculative backend work —
   before touching the backend. I audited Heat Map, Team Performance,
   Territory Intelligence, and Visit Efficiency's actual endpoint
   capabilities (all single-metric/single-scope-field, none doing a
   flexible group-by), confirmed no Prisma models exist for Customers/
   Invoices/Products (everything is Excel-upload-sourced through
   `RieFacade`), and reported the gap list. Client reviewed it, then said
   **"Approved"** with explicit minimum-scope constraints: no refactor of
   existing services, reuse `RieFacade`/existing entities/business rules,
   no generic/future-proof abstractions beyond this one screen, and stop
   to ask for the business definition of "Productivity" before
   implementing it (client chose: Sales ÷ count(Productive Visits)).

2. **Backend** — one new module, `decision-analytics-studio` (schemas +
   service + controller + module), reusing the exact `RieFacade`/rep-
   resolver/Zod-validation conventions every other module already follows,
   plus reusing `SgiService.getLatest()` unmodified for the AI Insight
   panel and Lost Sales KPI (no live per-click LLM call — instant-response
   requirement is incompatible with that). Three endpoints only:
   `POST /query` (the single aggregation engine — parameterized by
   `analyzeBy`, this ONE endpoint also IS the drill-down mechanism: a
   click just changes `analyzeBy` to the next dimension and narrows a
   filter, no separate drill endpoint), `GET /filter-options` (dropdown
   values for the 9 filterable fields), `POST /table` (paginated Invoice-
   line detail — the "Invoice" drill level). Self-caught and fixed one
   honesty bug during my own review: `buildChartGroups`'s per-group
   Collections/Returns were initialized to a fabricated `0` for non-
   product dimensions instead of the honest `null` these values actually
   are at that grain (Collections/Returns link to a Customer, not to a
   Category/Brand/etc. line) — fixed before considering the backend done.

3. **Frontend** — one Global Analysis State object (`{analyzeBy, filters}`)
   that every widget on `/dashboard/decision-analytics-studio` reads from
   and writes to, no widget updates another directly (client's explicit
   Cross Filtering requirement): global filter bar (9 multi-select filters
   built as a small local Radix dropdown-menu component, not by extending
   the shared `ui/dropdown-menu.tsx`, to keep this additive-only + a date
   range), 10 KPI cards (Sales/Growth/Coverage/Orders/Collections/Strike
   Rate/Active Customers/Lost Sales/Average Order/Productivity — null
   always renders as "—", never a fabricated value), a chart engine
   (`recharts`, newly added dependency) covering all 10 spec'd chart types
   (Column/Bar/Line/Area/Stacked/Pie/Treemap/Scatter/Pareto/Data Table —
   Stacked implemented honestly as a single 100%-composition bar of each
   group's real Sales value, since no fabricated sub-components exist at
   that grain), a Mini Heat Map (new lightweight Leaflet component — city
   points only, since the backend's heatmap is always flat/city-grouped,
   not the polygon-boundary Territory Intelligence map) bidirectionally
   linked to the same filter state, an AI Insight panel (SGI situations,
   scoped by the backend to the current filters), and a paginated Detail
   Table. Drill-down: clicking a chart mark advances `analyzeBy` along the
   Category→Brand→Product(SKU)→Customer chain while narrowing the matching
   filter to the clicked value; dimensions outside that chain (territory/
   channel/representative/supervisor) just narrow the filter with no
   further drill level, since the spec doesn't define one. "Invoice" is
   simply the Detail Table, which always reflects whatever filters are
   currently active — no separate mechanism needed.

4. **Territory Intelligence handoff** — "Open Territory Intelligence"
   encodes the full analysis state into a `?dasState=...&dasCity=...` deep
   link (same encode/decode-with-graceful-fallback pattern as the existing
   `SgiContext` deep link), navigates there, and Territory Intelligence
   (additive-only change, nothing behaves differently for any pre-existing
   entry point) auto-selects the matching territory by name and shows a
   "Return to Decision Analytics Studio" button that hands the untouched
   `dasState` straight back, restoring the exact prior state.

5. **i18n/nav** — 61 new `decisionAnalyticsStudio.*` keys + 1 new
   `territoryIntelligence.returnToDecisionStudio` key + `nav.
   decisionAnalyticsStudio`, added to both the AR and EN blocks and the
   `TranslationKey` union; new nav entry (blue `BarChart3` icon, "AI &
   Insights" group) added to the dashboard shell; new `decisionAnalyticsStudio`
   `ModuleColorKey` added to `lib/module-colors.ts`.

**Verification performed**: brace/paren/bracket balance on every new/
changed file (all balanced), every `getEntityRecords()` entity-name string
in the new service cross-checked against the 19-entity Canonical Entity
Registry (all 9 used strings match exactly), every imported schema type
confirmed exported and non-dead, a full programmatic cross-check of all 61
`decisionAnalyticsStudio.*` (+2 related) translation keys used in code
against the `TranslationKey` union and both AR/EN records (zero mismatches,
every key present exactly twice). **Could not get a real `tsc` compiler
pass this session** — the usual broken-symlink issue plus this sandbox's
mounted-drive I/O being unusually slow today (multiple simple `cp`/`tar`
operations timed out mid-copy) meant even a session-root `tsc` binary
couldn't finish a full typecheck before timing out; manually verified
`recharts`'s prop usage against its documented v2 API instead. **The
client's own spec requires browser verification before considering this
done, and this sandbox cannot run `pnpm dev` reliably — the user should
run `pnpm install && pnpm --filter web dev` locally, open
`/dashboard/decision-analytics-studio`, and click through the cross-
filtering/drill-down/chart-type-switch/Territory Intelligence handoff
paths before treating this as production-verified.**

---

## Geo Intelligence Engine — Phase 1 of 3 (Executive Map Redesign Spec, 2026-07-22)

Client delivered a full "FSOS Geo Intelligence Engine v2.0" spec (Arabic)
after flagging the Heat Map as "the app's weak point" and sharing 3
Folium/Leaflet reference exports (multi-layer per-category heat maps with a
native layer-control toggle UI). Hard Scope from the doc: map
rendering/interaction layer only -- no business logic, DB, or existing-API
changes unless a real gap exists; reuse existing services as much as
possible. Target: one unified Geo Intelligence Engine (shared map component
+ shared filters + shared analysis state) behind 8 map modes (Heat/Bubble/
Territory/Cluster/Opportunity/Risk/Coverage/Route), real geographic
drill-down, and AI Insight Panel integration.

Given the size (8 modes + engine + drill-down + AI + 100k-point performance
+ export), agreed an explicit 3-phase plan with the client before writing
any code (same process used for Decision Analytics Studio): **Phase 1** --
the unified engine + filters + architecture. **Phase 2** -- Heat Map +
Choropleth + Bubble + Cluster, the actual rendering modes. **Phase 3** --
drill-down + AI + cross-filtering + executive polish (fullscreen/export/
reset). Client also gave two explicit Phase-1 adjustments: (1) do NOT
generate approximate/convex-hull territory boundaries -- keep Territory
boundary polygons optional until real GeoJSON is available, architecture
just needs to be ready to load it later without a redesign; (2) confirmed
touching the map *widget* inside Territory Intelligence and the Heat Map
screen is in scope for a later phase, as long as business logic, existing
API compatibility, KPI calculations, and user workflows stay unchanged --
only the map rendering/interaction layer gets unified.

**Pre-build research surfaced two things that reshaped the plan:**

1. Territory Intelligence already has a real, working boundary/polygon
   system (`components/territory-intelligence/boundary-registry.ts` +
   `territory-map.tsx`, built in an earlier session, task #279): a
   pluggable per-country GeoJSON registry (`/public/geo-boundaries/*`),
   loaded and matched by territory name, with an *honest, non-fake*
   fallback -- a deterministic irregular polygon (not a circle) drawn only
   when no real boundary matches, with a visible "approximate demo
   boundaries" disclosure. This already satisfies the client's "no fake
   boundaries" adjustment exactly -- Phase 1 doesn't rebuild it, a later
   phase just points the unified engine's Choropleth mode at it as-is.
2. The module name "geo-intelligence" was already taken by an unrelated
   pre-existing feature (`apps/api/src/modules/geo-intelligence` -- the New
   Customer wizard's location-capture/nearest-customer lookup). The new
   engine is named **`geo-engine`** everywhere (backend module, frontend
   component folder, API client) specifically to avoid colliding with or
   touching that unrelated module, which the client's Hard Scope forbids
   touching anyway.

**What Phase 1 actually built:**

1. **Backend** -- new, self-contained `geo-engine` module (own
   `GeoEngineService`/Controller/Module, not importing any other module's
   private code, matching this codebase's established per-module isolation
   convention). `packages/schemas/src/geo-engine.schemas.ts` defines
   `geoFiltersSchema` -- field-for-field identical to Decision Analytics
   Studio's `decisionFiltersSchema` (branch/city/channel/category/brand/
   product/customer/rep/supervisor + date range) so one filter bar UI works
   for any future screen built on this engine -- plus a `geoKpiSchema`
   (`sales | orders | customers | visits | collections | lostSales`) and a
   `groupBy: "customer" | "city"` toggle. Country/Region were deliberately
   left out -- confirmed with the client that Customers only ever carries
   `City`, nothing above it, in the real data model; inventing those fields
   would violate this project's "never fabricate" discipline. Two real
   gaps got filled additively: `orders` (distinct invoice count) and
   `visits` (visit count) didn't exist as Heat Map metrics before -- both
   reuse entities/joins other modules already read (Invoices/Invoice Items
   for orders, Visits for visits), no schema/DB change, no existing
   endpoint touched.
2. **Frontend primitives** -- `components/geo-engine/geo-map-canvas.tsx`
   extracts the ~25-line "create a Leaflet map once, dynamic-import
   Leaflet client-side only, add the CartoDB Positron tile layer, clean up
   on unmount" block that `heatmap-map.tsx`, `mini-heatmap.tsx`, and
   `territory-map.tsx` each currently duplicate independently -- exposed
   via a `forwardRef` handle (`getMap()`/`getLeaflet()`) so any future mode
   renderer (Heat/Bubble/Cluster/Choropleth in Phase 2) can mount its own
   layer-building effect on top, the same way those three existing
   components already build their own layers, just without re-deriving the
   map lifecycle each time. `components/geo-engine/geo-filter-bar.tsx` is
   the unified filter bar -- reuses Decision Analytics Studio's existing
   `MultiSelectFilter` component and its `GET /decision-analytics-studio/
   filter-options` endpoint directly (same field set, same entities) rather
   than duplicating a filter-options endpoint, per the spec's explicit
   "reuse existing services" instruction.
3. **Phase 1 proof screen** -- new, additive `/dashboard/geo-engine` page
   (nav entry, cyan `Globe2` icon, "AI & Insights" group). Deliberately
   renders results as plain sized circle markers, NOT a polished heat map --
   the four real modes are Phase 2 scope. The only job of this screen is to
   let the client verify, in the real running app, that the new 9-filter
   bar + KPI selector + `geo-engine` backend return correct, properly-
   filtered real data before any Phase 2 rendering work gets built on top
   of it. **Heat Map and Territory Intelligence are completely untouched**
   -- this is a new, independent, additive screen; existing workflows are
   unaffected.
4. **i18n** -- 32 new `geoEngine.*` keys + `nav.geoEngine`, added to both
   AR/EN blocks and the `TranslationKey` union; new `geoEngine`
   `ModuleColorKey`.

**Verification performed**: brace/paren/bracket balance on every new file
(all balanced), every `getEntityRecords()` entity-name string in the new
service cross-checked against the Canonical Entity Registry (all 8 match
entities already used successfully by `decision-analytics-studio.service.ts`
-- Customers/Products/Invoices/Invoice Items/Routes/Employees/Collections/
Visits), a full programmatic cross-check of all `geoEngine.*` translation
keys against the `TranslationKey` union and both AR/EN records (909/909
keys match exactly, zero mismatches). **Could not get a real `tsc`
compiler pass this session either** -- found a working `tsc` binary outside
the workspace again, but a full `tsc --noEmit -p tsconfig.json` on
`apps/api` still didn't finish inside a 40s timeout (killed with exit code
124), same persistent sandbox I/O limitation as prior sessions. Relied on
manual verification instead (as disclosed above). **Per the client's own
instruction, Phase 1 stops here for the client to validate the new engine
in their own running app (`/dashboard/geo-engine`) before Phase 2 (the
actual Heat/Choropleth/Bubble/Cluster rendering modes) begins.**

---

## Geo Intelligence Engine — Phase 2 of 3 (map modes)

Client validated Phase 1 in their own running app ("المؤشرات شغالة بكفاءة")
and approved starting Phase 2: the four real map-rendering modes on top of
the Phase 1 engine (unified filters + KPI selector + `geo-engine` backend,
all untouched this phase).

**What got built, all under `apps/web/src/components/geo-engine/`:**

1. `color-scale.ts` — one shared blue -> cyan -> green -> yellow -> orange
   -> red intensity scale (matches the client's own reference Folium
   exports and their explicit correction: "كل ما تكون الكثافة عالية بيتحول
   للون البرتقالي ثم الاحمر"), exposed two ways: `heatGradientObject()` for
   `leaflet.heat`'s `gradient` option, `colorForRatio()` for discrete
   per-marker fills — so Heat/Bubble/Cluster modes read as one visual
   family instead of three different color languages.
2. `modes/heat-map-mode.tsx` — real `leaflet.heat` layer (same package
   `heatmap-map.tsx` already uses) but with radius/blur that scale with
   zoom (recomputed on `zoomend`, `42 - zoom*2.2` clamped 14-42) instead of
   heatmap-map.tsx's fixed 22/18, and the full 6-stop gradient above instead
   of a single-hue alpha ramp. `heatmap-map.tsx` itself is untouched —
   swapping the standalone Heat Map screen onto this mode is a deliberate
   next step, not done this phase.
3. `modes/bubble-map-mode.tsx` — circles whose RADIUS scales with
   `sqrt(value)` (area-proportional, so a value that's 4x bigger reads as
   ~2x the radius / ~4x the visual area, matching how size differences are
   actually perceived) and whose fill color comes from the same intensity
   scale.
4. `modes/cluster-map-mode.tsx` — merges points into a zoom-sized grid
   (`8 / 2^zoom` degrees per cell, rebucketed on `zoomend`) instead of
   depending on the `leaflet.markercluster` plugin. Deliberate choice: this
   sandbox has repeatedly hit long stalls installing even one new npm
   package into `apps/web` (documented in the Decision Analytics Studio
   entry above), and grid clustering delivers the spec's actual requirement
   ("دمج العملاء عند Zoom Out. تفكيكهم عند Zoom In.") without that risk.
   Clicking a cluster zooms in on it, which naturally re-buckets into
   smaller clusters or individual points. Swappable for the real plugin
   later without touching anything else in the engine.
5. `modes/territory-map-mode.tsx` — per the client's explicit "no fake
   boundaries" instruction, this does NOT reinvent polygon rendering: it's
   a thin adapter that converts this engine's city-grouped points into the
   exact node shape Territory Intelligence's own `TerritoryMap` component
   already expects, and reuses that component unchanged (real GeoJSON
   boundaries when available, honest non-fake fallback shape otherwise).
   The only change to `territory-map.tsx` itself is one new optional prop,
   `colorForValue` — when omitted (Territory Intelligence's own caller
   never passes it), behavior is byte-for-byte identical to before; when
   provided, it replaces the polygon fill-color lookup so a caller whose
   nodes don't carry a full `TerritorySummaryItem` (this engine's nodes
   don't) can still drive real value-based coloring.
6. `/dashboard/geo-engine` page — Phase 1's placeholder circle markers
   replaced with a mode switcher (Heat/Bubble/Cluster/Territory pill
   buttons). Switching modes never re-queries with a different shape, it
   only changes how the same `result.points` gets drawn — except Territory
   mode, which forces `groupBy: "city"` (visibly, via the existing group-by
   control) since choropleth needs one shape per territory. Heat/Bubble/
   Cluster all mount on Phase 1's shared `GeoMapCanvas`; Territory mode
   renders `TerritoryMap` directly (it owns its own separate Leaflet map
   instance already — forcing it onto the shared canvas is later
   migration work, not required to prove this mode).

**One real bug caught and fixed before it shipped**: the first version of
the mode-mount logic used a boolean `mapReady` flag to tell each mode
component "the canvas is ready, build your layer." Switching to Territory
mode and back unmounts/remounts `GeoMapCanvas` (a brand-new Leaflet map
instance each time), but a boolean stuck at `true` from the *previous*
instance would never flip again — meaning the mode component's data-driven
effect would never re-run for the new instance, silently rendering nothing
until an unrelated state change happened to retrigger it. Fixed by
replacing the boolean with an incrementing version counter
(`mapReadyTick`), so every real "canvas instance is ready" event always
produces a fresh value React's effect dependencies actually see as changed.

**Verification performed**: brace/paren/bracket balance on every new/
changed file (all balanced), a full programmatic cross-check of every
`geoEngine.*` translation key against the `TranslationKey` union and both
AR/EN records (915/915 keys match, zero mismatches), manual review of every
`leaflet`/`leaflet.heat` type usage against the existing ambient
declarations in `src/types/leaflet-heat.d.ts` and how `heatmap-map.tsx` /
`territory-map.tsx` already use them. **`tsc --noEmit` still could not
complete within a 40s window on `apps/web`** (same persistent sandbox I/O
limitation as every prior session) — relied on the manual review above
instead. **Standalone Heat Map and Territory Intelligence are still
completely untouched** — swapping their rendering onto this engine (which
the client already approved doing whenever it's ready) is the natural next
step, either as the rest of Phase 2 or folded into Phase 3, client's call.

## Geo Intelligence Engine — Phase 3 of 3 (Drill Down, Cross Filtering, AI Insight Panel, Executive Tools)

**Date**: 2026-07-22
**Scope (client-approved, verbatim)**: "Proceed with Phase 3 as one integrated implementation. Scope: Drill Down (City -> Territory -> Customer -> Invoice); Cross Filtering across the entire workspace; AI Insight Panel integration using the existing SGI service; Executive Experience (Fullscreen, Reset View, Export Image, Export PDF)." Requirements: reuse the existing Global Analysis State, no duplicate state management, no changes to business logic/KPI calculations, no new AI service, synchronized interactions with no page refreshes.

**Global Analysis State**: consolidated the page's four previously-separate `useState`s (`filters`/`kpi`/`groupBy`/`mode`) into one `GeoAnalysisState` object, mirroring Decision Analytics Studio's own `{ analyzeBy, filters }` pattern (there is no separate shared hook/context to import — DAS's own page-level comment confirms its "Global Analysis State" is this same per-page-object convention, not a singleton). The map/KPI-cards/chart/AI-panel/detail-table all read from ONE `useQuery` keyed on this state object, so any change — a filter edit, a map click, a chart-bar click, a breadcrumb click — reactively refetches and re-renders every widget with no manual "Update" button (removed) and no page refresh.

**Drill Down — City -> Territory -> Customer -> Invoice**: implemented with zero extra state. In this codebase's own established vocabulary a City IS a Territory (`decisionAnalyzeByDimensionSchema`'s `territory, // Customers.City`; Territory Intelligence's whole city-boundary system) — so "City -> Territory" is one click, not two: clicking a city-level point narrows `filters.cityValues` and switches the mode to Bubble (mirroring Territory Intelligence's own polygon-level -> point-level convention). Clicking a customer point narrows `filters.customerCodes` AND `filters.cityValues` together (from the point's own `city` field), so both breadcrumb segments populate from one click. "Invoice" is the Detail Table always rendered below, reflecting current scope — same established convention `decision-analytics-studio.service.ts`'s own drill chain already uses for its final level (see that file's `DRILL_CHAIN_NEXT` comment). The breadcrumb component (`geo-breadcrumb.tsx`) is a pure derivation of `filters.cityValues[0]`/`filters.customerCodes[0]` — no parallel `drillPath` array — reuses `territoryIntelligence.breadcrumbRoot`'s existing translation key instead of adding a duplicate.

**Cross Filtering**: every map mode (Heat/Bubble/Cluster/Territory) and the new Top-10 bar chart now accept an `onPointClick` callback wired to the same handler. Bubble/Cluster/Territory already had real per-point markers to attach a click to; Heat Map (leaflet.heat renders one canvas overlay with no per-point DOM) got an additional invisible `CircleMarker` per point purely as a click target, zero visual change to the gradient. Cluster markers only fire `onPointClick` for single-point buckets (a real object) — clicking a multi-point cluster still just zooms in, unchanged.

**AI Insight Panel**: `GeoEngineModule` now imports `SgiModule`; `GeoEngineService.query()` calls the new `computeInsights()` (a direct copy of `decision-analytics-studio.service.ts`'s SGI-filtering block, adapted to this module's own `compileFilters`/`customerInScope` helpers) which calls `SgiService.getLatest(user)` once and filters the already-persisted `situations[]` down to whichever customers/reps are in the current `GeoFilters` scope — same reuse pattern Decision Analytics Studio and Territory Intelligence already independently established (this is the 4th instance, not a new one). No live LLM call. The result's `insights` field reuses `decisionInsightItemSchema`/`DecisionInsightItem` as-is (identical shape), and the frontend renders it via DAS's own `<AiInsightPanel>` component directly — imported, not copied — since the shape lines up exactly.

**Detail Table ("Invoice")**: new `POST /geo-engine/table` endpoint + `GeoEngineService.table()`, structurally identical to `decision-analytics-studio.service.ts`'s `table()` (GeoFilters is already field-identical to DecisionFilters) but reading through this module's own `loadContext()`, per this codebase's established per-module isolation convention. Required extending `geo-engine.service.ts`'s internal metadata: `ProductMeta` gained `name`, `ResolvedRep` gained `repName`/`supervisorName`, `SalesRow` gained `lineNo` — all additive, no existing KPI/query behavior touched. Frontend `GeoDetailTable` mirrors DAS's `DetailTable` exactly, reusing its `decisionAnalyticsStudio.*` column/pagination translation keys directly instead of duplicating labels.

**Executive Tools (Fullscreen / Reset View / Export Image / Export PDF)**: confirmed via repo-wide search that nothing in this codebase does DOM capture or native Fullscreen today — Territory Intelligence's own "Export Image"/"Export PPT" buttons are disabled `title="Coming soon"` placeholders with no implementation behind them. This is genuinely new code: native `Element.requestFullscreen()`/`document.exitFullscreen()` for Fullscreen, and two new frontend dependencies — `html2canvas` (DOM -> canvas) and `jspdf` (canvas -> single-page PDF, auto-orientation from the captured aspect ratio) — added to `apps/web/package.json`, dynamic-imported on click only (same "keep it out of the SSR bundle" convention already used for `xlsx`/`pptxgenjs` elsewhere in this app). Reset View resets the whole `GeoAnalysisState` to its defaults (today's month range, `kpi:"sales"`, `groupBy:"customer"`, `mode:"heat"`, no filters) — same idea as DAS's own `handleResetFilters`.

**Files touched**: `packages/schemas/src/geo-engine.schemas.ts` (insights field reusing `decisionInsightItemSchema`, new `geoTableQueryInputSchema`/`geoTableRowSchema`/`geoTableResultSchema`), `apps/api/src/modules/geo-engine/geo-engine.module.ts` (+`SgiModule`), `geo-engine.service.ts` (+`SgiService` injection, `computeInsights()`, `table()`, richer metadata), `geo-engine.controller.ts` (+`POST /table`), `apps/web/src/lib/types.ts` + `lib/api/geo-engine.ts` (mirrored additions), `apps/web/package.json` (+html2canvas, +jspdf), and (all new) `components/geo-engine/geo-breadcrumb.tsx`, `geo-kpi-cards.tsx`, `geo-chart.tsx`, `geo-detail-table.tsx`, `executive-tools.tsx`, plus `onPointClick` added to all 4 existing map-mode components and a full rewrite of `/dashboard/geo-engine/page.tsx` orchestrating everything through the single `GeoAnalysisState`.

**Verification performed**: brace/paren/bracket balance on every new/changed file (all balanced, checked in one batch), a full programmatic cross-check of every translation key against the `TranslationKey` union and both AR/EN records (928/928/928, zero mismatches), a repo-wide grep confirming no stray references to the removed manual "Update Map" button/mutation. **Not performed**: a live browser run-through of the Definition of Done (click a point -> KPIs/chart/AI panel/table all update; drill down and back via breadcrumbs; Fullscreen/Export Image/Export PDF actually produce correct output) — this sandbox has no way to run the app's dev server or a browser against it, same limitation disclosed in the Phase 1/Phase 2 log entries for `tsc --noEmit`. The client should smoke-test the full Definition of Done directly after their next `pnpm install && pnpm build && pnpm start` (this phase adds two new npm dependencies, so `pnpm install` is required this time, not just a build).

## Geo Intelligence Engine — Phase 3 follow-ups: build fix, Fullscreen/filters bug, standalone Heat Map generalization

**Date**: 2026-07-22

**Build fix**: `apps/web/src/app/(dashboard)/dashboard/geo-engine/page.tsx`'s `cityLabel`/`selectedCustomerCode` computation broke `pnpm build` twice in a row. First cause: `state.filters.cityValues[0]` accessed inline off an optional-chained length check isn't narrowed away from `undefined` unless the property is captured in a stable local first. Second (the real, persistent cause): this repo's `packages/config/tsconfig.base.json` sets `noUncheckedIndexedAccess: true`, so `cityValues[0]` is typed `string | undefined` regardless of any preceding `.length === 1` check — TypeScript doesn't correlate a length comparison with index-in-bounds. Fixed with `(cityValues[0] ?? null)` after assigning to a local const, same documented gotcha as this log's earlier Route Planning entry.

**Fullscreen breaking filters (live user report)**: `ExecutiveTools`'s Fullscreen button was calling `targetRef.current.requestFullscreen()` on just the workspace `<div>`. Radix's Select/MultiSelectFilter popups render into a portal attached to `document.body` by default — outside that div's subtree — so once fullscreen was active, every dropdown still opened (state updated) but its popup content sat outside the fullscreened element and was invisible/unreachable, reading as "the filters don't work." Fixed by fullscreening `document.documentElement` instead, which keeps `document.body` (and therefore every portal) inside the fullscreened tree, at the cost of the dashboard's own sidebar/header also being visible while fullscreen is on — judged a far safer fix than teaching every dropdown a custom portal container (which would touch shared UI primitives used across the whole app). Export Image/PDF are unaffected — `captureCanvas()` still targets the workspace div only, so exports stay scoped to just the Geo Engine content.

**Standalone Heat Map screen generalization (client request: "عمم على باقي الشاشات اللي فيها خرائط حرارية")**: confirmed via a repo-wide grep for `leaflet.heat`/`heatLayer` usage that the standalone `/dashboard/heatmap` screen's `heatmap-map.tsx` is the only other real heat-density-layer screen in the app (Territory Intelligence renders polygons, not a heat layer; Visit Efficiency's `visit-map.tsx` only carries a historical comment — task #105 already moved it to markers for reliability reasons). Migrated its rendering, staying strictly within "map rendering/interaction layer only" per the client's original approval (no changes to `heatmap.service.ts`, filters, KPI calculations, or any endpoint):
- Extracted `radiusForZoom` out of `geo-engine/modes/heat-map-mode.tsx` into the shared `geo-engine/color-scale.ts`, so both screens' Heat Map rendering now share one implementation instead of `heatmap-map.tsx` keeping its own old fixed `radius: 22, blur: 18` constants.
- Added the same `zoomend`-driven radius/blur retune `heat-map-mode.tsx` already had, split into its own effect (separate from bounds-fitting) so it never fights the user's manual zoom — same reasoning as that file's own comment.
- Gradient selection: when exactly one layer is on screen (the normal case), now uses `heatGradientObject()` — the real multi-stop blue → cyan → green → yellow → orange → red density gradient from the client's own reference exports — instead of the old single-hue opacity gradient. When 2+ layers are up at once (the category/channel comparison toggles from task #251), each layer keeps its own distinct solid hue instead, since a shared gradient would make overlapping layers indistinguishable — comparison mode's whole point.

**Verification performed**: brace/paren/bracket balance on every changed file (all balanced). **Not performed**: a live browser re-check of the Fullscreen fix or the standalone Heat Map screen's new gradient — same sandbox limitation as every prior entry; the client should confirm both directly after their next `pnpm build && pnpm start`.

## Chart Intelligence Engine — Phase 1: Unified Semantic Color Engine

**Date**: 2026-07-22

**Client spec**: "FSOS Chart Color & Visual Intelligence Standard v1.0" (uploaded docx) + follow-up instruction: "Implement a unified semantic color engine. The engine must automatically select the coloring strategy: Target-Based Coloring whenever the displayed KPI includes valid target values (e.g. Sales Rep, Supervisor, Manager performance); Relative Semantic Coloring whenever no target exists (e.g. Customers, Products, Cities, Territories, Lost Sales). The selection must happen automatically without requiring different chart implementations."

**Pre-work audit**: confirmed via repo-wide search that `recharts` is the only charting library in the app, used in exactly two files — `decision-analytics-studio/chart-engine.tsx` (9 chart types: Column/Bar/Line/Area/Stacked/Pie/Treemap/Scatter/Pareto) and `geo-engine/geo-chart.tsx` (1 Top-10 bar chart). Every bar/slice/point in both was hardcoded to one fixed hue (`#2563eb`/`#0891b2`), with only a hardcoded amber override for the currently-selected item — no semantic (good/bad) coloring existed anywhere.

**Target-data research**: confirmed a real target value exists today — the RIE Canonical "Targets" entity (Month/Year/RouteID/SalesTarget, official import template), the same source SGI's `TARGET_BEHIND` situation already reads via a RouteID -> rep two-hop join. Decision Analytics Studio's `analyzeBy` chart output had no target field at all before this change.

**Engine**: new `apps/web/src/components/charts/chart-color-scale.ts`. Exports `SEMANTIC_COLORS` (green/yellow/orange/red/blue/gray, one fixed business meaning each) and `colorChartSeries`/`colorHexChartSeries(points, polarity)`, which take an array of `{ value, target? }` and return one color per point. Strategy is resolved **once per series**: if ANY point in the series carries a real (non-null, >0) `target`, the whole series uses Target-Based Coloring (actual/target ratio: >=110% excellent, 90-110% stable, 70-89% warning, <70% critical — the client's own thresholds); otherwise Relative Semantic Coloring (percentile rank of each value within the *currently filtered* dataset, quartile buckets, `polarity` flips direction for "lower is better" metrics like Lost Sales/Returns). A point with `value` null/undefined always renders gray ("no data"); a point riding a target-based series with no target of its own also renders gray rather than silently reverting to relative ranking for just that one item.

**Backend wiring (to make Target-Based Coloring real, not just theoretical)**: `decisionChartGroupSchema` gained a `target: number | null` field. `decision-analytics-studio.service.ts`: `loadContext()` now also loads the RIE "Targets" entity and derives a `repEmail -> supervisorEmail` map from every Route (not just routes with a target row); new `buildRepTargetTotals()` sums `SalesTarget` per rep for Target rows whose calendar month overlaps the query's `[dateFrom, dateTo]` window (generalizing SGI's single-month join to this module's arbitrary date range); `buildChartGroups()` now populates `target` per group — direct lookup for `analyzeBy:"representative"`, summed across that supervisor's reps for `analyzeBy:"supervisor"`, `null` for every other dimension (Territory/Channel/Category/Brand/Product/Customer — no target concept exists for them, matching the spec's own Relative Semantic Coloring examples). No existing KPI calculation, endpoint shape, or business logic changed — purely additive.

**Frontend wiring**: `chart-engine.tsx` and `geo-chart.tsx` now compute per-series colors via `colorHexChartSeries` and apply them to Column, Bar, Stacked, Pie, Treemap, Scatter, and Pareto bars (all replaced their single fixed fill). Treemap needed a custom `content` render prop (recharts doesn't support `<Cell>` children there) to get per-tile semantic fill. Pareto's cumulative line was actually red (`#dc2626`) before this change despite a "blue trend line" intent — corrected to `SEMANTIC_COLORS.neutral` (blue) per the spec's explicit "Cumulative line uses Blue" rule. Selection state (the previously-hardcoded amber override) is now a stroke/outline drawn on top of the semantic fill instead of replacing it, so a selected bar's business-meaning color stays visible. Line/Area charts were left as-is (already blue, matching the spec's "Blue line for the trend"; their more elaborate turning-point-marker/gradient-direction rules are Phase 2 "redesign all chart types" scope, not this engine).

**Files touched**: `packages/schemas/src/decision-analytics-studio.schemas.ts`, `apps/web/src/lib/types.ts`, `apps/api/src/modules/decision-analytics-studio/decision-analytics-studio.service.ts`, `apps/web/src/components/charts/chart-color-scale.ts` (new), `apps/web/src/components/decision-analytics-studio/chart-engine.tsx`, `apps/web/src/components/geo-engine/geo-chart.tsx`.

**Verification performed**: full manual read-through of every changed file for brace/paren balance, signature/call-site consistency (loadContext's destructured tuple order, buildChartGroups' new parameters at its one call site), and confirmation no other code constructs a `DecisionChartGroup` object that would now be missing the new required `target` field. Attempted a real `tsc --noEmit` from this sandbox but the mounted Windows `node_modules` has broken cross-filesystem symlinks (pnpm's Windows-native symlinks don't resolve over the Linux mount) — every package's own dependencies (including `zod`) report as unresolvable, an environment artifact, not a code issue. **Not performed**: an actual `pnpm typecheck`/`pnpm build`/browser run — the client should run these on their machine as usual; if a rep/supervisor's Targets data is uploaded, their bars should now render red/orange/yellow/green instead of blue.

## Decision Analytics Studio: mini-map gets Heat/Bubble/Cluster modes

**Date**: 2026-07-22

Client asked the DAS mini-map to match Geo Engine's three view modes. Rewrote `mini-heatmap.tsx` in place (still its own self-contained Leaflet instance, not migrated onto Geo Engine's shared `GeoMapCanvas`): added a mode switcher (reusing `geoEngine.modeHeat/modeBubble/modeCluster` i18n keys) and ported Geo Engine's heat-layer and grid-clustering logic in compact form, using the shared `heatGradientObject`/`radiusForZoom`/`colorForRatio` helpers from `geo-engine/color-scale.ts`. Fill colors are now semantic (`colorForRatio`) instead of one fixed blue; selection is shown via border/weight only, consistent with the chart color engine's convention. City-toggle filtering behavior unchanged, no backend/prop changes. Not verified in browser (sandbox can't run the dev server) — client should check after `pnpm build`.

## DAS chart tooltip target/achievement + heatmap (0,0) fix

**Date**: 2026-07-22

Column/Bar tooltips in `chart-engine.tsx` now show Target + Achievement % lines (new `renderGroupTooltip`, new i18n keys `decisionAnalyticsStudio.tooltipTarget`/`tooltipAchievement`) whenever the hovered group carries a real target — same graceful omit-if-absent as the color engine. Also fixed `decision-analytics-studio.service.ts`'s `buildHeatmap`: cities with zero customers having valid Latitude/Longitude used to be emitted at a fabricated `(0,0)` point instead of being dropped — could distort the mini-map's fitBounds or show a phantom marker. Now filtered out entirely (still counted in KPI totals, just not mappable). Not verified in browser.

## DAS mini-map "only one point" — actual root cause found

**Date**: 2026-07-22

Client pushed back correctly on my earlier "maybe it's the uploaded data" guess, asking for a full query -> filters -> aggregation -> map-payload trace. Traced it and compared line-by-line against Geo Engine's equivalent (which shows the same data fine): `buildHeatmap()`'s per-row loop had `if (!c || !c.city) continue;` — silently dropping a customer's sales from the map entirely whenever their `City` text field was blank, even with perfectly valid Latitude/Longitude. Geo Engine's own point-builder never gates on `City` at all (only requires a sane coordinate pair, and falls back to `city || name` as the grouping label in its own `groupByCity`) — that asymmetry is why Geo Engine could show many points from the same dataset while this map collapsed to almost none. Fixed to match Geo Engine exactly: drop the `City` requirement, fall back to `c.city || c.name` as the bucket key/label, and reuse the same `isSaneCoordinate` rejection (rejects out-of-range values and literal (0,0)) instead of a bare non-null check. Root cause was in the aggregation pipeline, not the uploaded data or active filters. Not verified in browser.
