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
