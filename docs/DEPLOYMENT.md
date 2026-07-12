# Deploying `apps/api` to Railway

Why: the API was running locally + tunneled through a free ngrok domain. Free
ngrok requires your machine to stay on and connected, and the tunnel going
down is exactly what caused the `ERR_NGROK_3200` error ChatGPT hit mid
conversation. This moves the API to an always-on host instead.

This repo is already set up for it: `Dockerfile.api` (root) builds just
`apps/api` and what it depends on (`packages/database`, `packages/schemas`)
using the standard turborepo "prune" pattern; `railway.json` tells Railway to
build with that Dockerfile.

## 0. One thing to decide first: file storage

`apps/api` needs an S3-compatible bucket for uploaded Excel files
(`STORAGE_*` env vars below) — locally that's MinIO via `docker-compose`,
which only exists on your machine. Production needs a real bucket. Cheapest/
simplest: **Cloudflare R2** (S3-compatible, generous free tier, no egress
fees). AWS S3, Backblaze B2, or DigitalOcean Spaces all work too — the code
just needs S3-compatible `STORAGE_ENDPOINT`/keys, nothing R2-specific.

## 1. Create the Railway project (dashboard, no CLI needed)

1. Sign up / log in at [railway.com](https://railway.com) with GitHub
   (`ahmedhosnybeyti-byte`). Currently a one-time $5 trial credit for 30
   days, then Hobby is $5/month.
2. A project may already exist from earlier setup (e.g. `intuitive-miracle`)
   — open it if so, instead of creating a new one (creating a *new* project
   can hit the free trial's resource-creation cap; adding a service to an
   existing empty project does not).
3. Click **"+ Add"** → **"GitHub Repository"** → select `fsos-app`.
   **Gotcha:** if you instead use Railway's "New Project → Deploy from
   GitHub repo" AI-assisted flow, it may try to auto-detect *multiple*
   services from the monorepo with guessed names that don't match this
   repo's real structure (seen: `mockup-...`, `api-spec`, `api-client...`).
   Don't apply that plan. Adding via "+ Add → GitHub Repository" on an
   already-open project adds one plain service instead.
4. On that one service: **Settings → Source → Root Directory** should be
   blank/`/` (repo root, not `apps/api` — the Dockerfile needs the whole
   monorepo as build context). **Settings → Build → Builder = Dockerfile**,
   **Dockerfile Path = `Dockerfile.api`**. `railway.json` at the repo root
   declares this already; just verify it took.
5. Same project → **"+ Add"** → **Database → Add PostgreSQL**.

## 2. Set environment variables

Dashboard → your API service → **Variables**. Set:

```
NODE_ENV=production
PORT=4000
API_URL=<filled in after step 5, once you have the Railway domain>
WEB_URL=http://localhost:3000        # update once apps/web is deployed too
CORS_ORIGINS=http://localhost:3000   # same
COOKIE_DOMAIN=localhost              # same

DATABASE_URL=${{Postgres.DATABASE_URL}}   # Railway variable reference — auto-fills from the Postgres service you added in step 1

JWT_ACCESS_SECRET=<generate — see below>
JWT_REFRESH_SECRET=<generate — see below>

STORAGE_ENDPOINT=<your R2 endpoint, from the Cloudflare R2 API token page>
STORAGE_REGION=auto
STORAGE_BUCKET=field-sales-os
STORAGE_ACCESS_KEY_ID=<your R2 Access Key ID>
STORAGE_SECRET_ACCESS_KEY=<your R2 Secret Access Key>
STORAGE_FORCE_PATH_STYLE=true
```

To generate each JWT secret (Node is already required for this project, so
this works with no extra install — run it twice, once per secret):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Deploy

Railway auto-deploys on every push to `master` once the service is
connected to the GitHub repo — just wait for the build to finish in the
**Deployments** tab. (CLI alternative, if you ever want it:
`npm install -g @railway/cli && railway login && railway up`.)

This builds `Dockerfile.api`. First deploy takes a few minutes (pnpm
install + prisma generate + turbo build) — watch the build logs for errors.

## 4. Get the public URL and finish wiring env vars

Dashboard → API service → **Settings → Networking → Generate Domain**. Copy
the `https://....up.railway.app` URL, then go back to step 2 and set
`API_URL` to it. Railway redeploys automatically when a variable changes.

## 5. Seed the database once

Dashboard → API service → click into a running deployment → look for a
**"Run Command"** / one-off shell option (or use the CLI:
`railway run pnpm --filter @field-sales-os/database seed`).

`migrate:deploy` already runs automatically on every container start per
`Dockerfile.api`'s `CMD`, so it doesn't need a manual step — only `seed`
does, and only once (running it twice just re-seeds the same demo data,
which is harmless but pointless).

## 6. Re-point the Custom GPT at the new URL

Two places had the old ngrok URL hardcoded/configured:

- `apps/api/src/main.ts` — the Swagger `addServer(...)` call. Update it to
  the new Railway domain (cosmetic — only affects the `/docs` UI).
- The GPT Builder's **Action** import URL, and **Admin → Platform Settings
  → Custom GPT base URL** if that's meant to reflect where the API lives —
  see `docs/GPT_SETUP.md` Step 3.

Then retest the multi-question conversation that hit `ERR_NGROK_3200`
before, to see if a stable host resolves it on its own.
