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
