-- Customer Discovery provider config (provider-agnostic, approved
-- 2026-07-19) — the DB knows exactly three provider-related facts and
-- nothing else: chosen provider id, its credentials (one encrypted JSON
-- blob keyed by provider id), and each prospect's source provider id.
-- All provider names/auth-types/settings live in the code's provider
-- layer — adding/removing a provider never touches this schema again.
ALTER TABLE "company_profiles" ADD COLUMN "discovery_provider" TEXT NOT NULL DEFAULT 'OSM';
ALTER TABLE "company_profiles" ADD COLUMN "discovery_credentials_encrypted" TEXT;

-- prospects.source: enum -> free TEXT ("UPLOAD" or any provider id).
ALTER TABLE "prospects" ALTER COLUMN "source" TYPE TEXT USING "source"::text;
DROP TYPE "ProspectSource";
