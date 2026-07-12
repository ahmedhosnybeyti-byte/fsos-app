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

## 1. Create the Railway project (you do this part — it's your account/billing)

1. Sign up at [railway.com](https://railway.com). Currently a one-time $5
   trial credit for 30 days, then Hobby is $5/month. Whether a card is
   required at signup has changed a few times — confirm on their pricing
   page when you sign up.
2. Install the CLI: `npm install -g @railway/cli`
3. `railway login`
4. From the repo root: `railway init` — creates a new Railway project linked
   to this folder.
5. In the Railway dashboard for that project: **New → Database → Postgres**.
   This gives you a `DATABASE_URL` you can reference from the API service
   without copying it by hand (see step 3 below).

## 2. Point Railway at the Dockerfile

In the Railway dashboard, on the API service: **Settings → Build → Builder
= Dockerfile**, **Dockerfile Path = `Dockerfile.api`**. (`railway.json`
already declares this — Railway should pick it up automatically on first
deploy; check it landed correctly.)

## 3. Set environment variables

Dashboard → your API service → **Variables**. Set:

```
NODE_ENV=production
PORT=4000
API_URL=<filled in after step 5, once you have the Railway domain>
WEB_URL=http://localhost:3000        # update once apps/web is deployed too
CORS_ORIGINS=http://localhost:3000   # same
COOKIE_DOMAIN=localhost              # same

DATABASE_URL=${{Postgres.DATABASE_URL}}   # Railway variable reference — auto-fills from the Postgres service you added in step 1

JWT_ACCESS_SECRET=<generate: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate: openssl rand -hex 32>

STORAGE_ENDPOINT=<your R2/S3 endpoint>
STORAGE_REGION=auto
STORAGE_BUCKET=<your bucket name>
STORAGE_ACCESS_KEY_ID=<your key>
STORAGE_SECRET_ACCESS_KEY=<your secret>
STORAGE_FORCE_PATH_STYLE=true
```

## 4. Deploy

```bash
railway up
```

This builds `Dockerfile.api` and deploys it. First deploy takes a few
minutes (pnpm install + prisma generate + turbo build).

## 5. Get the public URL and finish wiring env vars

Dashboard → API service → **Settings → Networking → Generate Domain**. Copy
the `https://....up.railway.app` URL, then go back to step 3 and set
`API_URL` to it, redeploy (`railway up` again, or it may auto-redeploy on
variable change).

## 6. Seed the database once

```bash
railway run pnpm --filter @field-sales-os/database migrate:deploy
railway run pnpm --filter @field-sales-os/database seed
```

(`migrate:deploy` also runs automatically on every container start per
`Dockerfile.api`'s `CMD` — this manual run is just for the first time, and
`seed` only needs running once.)

## 7. Re-point the Custom GPT at the new URL

Two places had the old ngrok URL hardcoded/configured:

- `apps/api/src/main.ts` — the Swagger `addServer(...)` call. Update it to
  the new Railway domain (cosmetic — only affects the `/docs` UI).
- The GPT Builder's **Action** import URL, and **Admin → Platform Settings
  → Custom GPT base URL** if that's meant to reflect where the API lives —
  see `docs/GPT_SETUP.md` Step 3.

Then retest the multi-question conversation that hit `ERR_NGROK_3200`
before, to see if a stable host resolves it on its own.
