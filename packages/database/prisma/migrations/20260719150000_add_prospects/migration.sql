-- Customer Discovery (AI Visit Copilot Phase 2) — see schema.prisma's
-- Prospect model doc comment.

-- CreateEnum
CREATE TYPE "ProspectSource" AS ENUM ('UPLOAD', 'GOOGLE');
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'VISITED', 'IGNORED', 'CONVERTED');

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "source" "ProspectSource" NOT NULL,
    "external_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "discovered_by_user_id" TEXT,
    "source_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospects_company_id_source_external_key_key" ON "prospects"("company_id", "source", "external_key");
CREATE INDEX "prospects_company_id_status_idx" ON "prospects"("company_id", "status");

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_discovered_by_user_id_fkey" FOREIGN KEY ("discovered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
