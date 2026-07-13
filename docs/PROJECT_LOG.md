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
