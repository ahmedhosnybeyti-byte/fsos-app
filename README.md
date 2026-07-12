# Field Sales OS

A SaaS platform that manages companies, users, subscriptions, and secure access to each company's Custom ChatGPT. **The platform is not the AI** — it controls who is allowed to use it, and verifies that on every single request.

See [`docs/GPT_SETUP.md`](./docs/GPT_SETUP.md) for wiring up the Custom GPT Action, and the architecture plan this repo was built from for the full design rationale (database schema, security model, module boundaries).

## Stack

- **apps/api** — NestJS 11, PostgreSQL + Prisma, JWT session auth + argon2, Zod validation
- **apps/web** — Next.js 15 (App Router), Tailwind + a small shadcn-style UI kit, TanStack Query
- **packages/database** — Prisma schema, migrations, seed script
- **packages/schemas** — Zod schemas/enums shared by both apps (single source of truth for validation)
- Local dev infra: Docker Compose running Postgres + MinIO (S3-compatible), so the whole stack runs offline with zero cloud accounts

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable && corepack prepare pnpm@11 --activate`, or `npm i -g pnpm`)
- **Docker Desktop** — required to run Postgres + MinIO locally. Install it, make sure it's running, then continue below.

## First-time setup

```bash
pnpm install

# Start local Postgres + MinIO
pnpm docker:up

# Copy env files (defaults already match docker-compose.yml)
cp packages/database/.env.example packages/database/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Create the database schema and seed demo data
pnpm db:migrate
pnpm db:seed
```

The seed script prints login credentials for a platform Super Admin and a demo company's Company Admin, plus a placeholder GPT API key — copy them from the terminal output.

## Running the app

```bash
pnpm dev
```

This runs both apps in parallel via Turborepo:

- API: http://localhost:4000 (Swagger docs at `/docs`, GPT Action schema at `/docs/gpt-actions-json`)
- Web: http://localhost:3000

## Workflow this app implements

Login → subscription verified (server-side, on every request) → upload role-scoped Excel files → launch the company's Custom GPT with a one-time code → the GPT calls back to verify that code + the subscription before → AI analysis.

## Repo layout

```
apps/
  api/     NestJS backend — one module per business capability
            (auth, companies, users, roles, plans, subscriptions,
            payments, files, gpt, audit-log, usage-analytics,
            scheduled-tasks)
  web/     Next.js frontend — (marketing) landing page,
            (auth) login/register, (dashboard) company users,
            (admin) platform Super Admin
packages/
  database/  Prisma schema + migrations + seed
  schemas/   Shared Zod schemas/enums/constants
  config/    Shared tsconfig bases
docs/
  GPT_SETUP.md   Wiring up the Custom GPT Action (manual, in ChatGPT's UI)
docker-compose.yml   Local Postgres + MinIO
```

## What's intentionally stubbed for the MVP

- **Payments**: built behind an abstract `PaymentProvider` interface (`apps/api/src/modules/payments/payment-provider.interface.ts`) with only a `ManualPaymentProvider` (a Super Admin marks a payment received). Dropping in Stripe/Paymob later means implementing that interface — no call-site changes.
- **Object storage**: same pattern (`StorageProvider` interface, `S3StorageProvider` implementation) — points at local MinIO by default; swap the `STORAGE_*` env vars for real S3/R2 in production, zero code change.
- **The Custom GPT itself**: created manually in OpenAI's GPT Builder — see `docs/GPT_SETUP.md`.
