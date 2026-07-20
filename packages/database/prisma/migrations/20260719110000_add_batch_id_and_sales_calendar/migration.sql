-- Multi-sheet batch upload (2026-07-19) — see schema.prisma's File.batchId
-- doc comment. Hand-written (not auto-generated) because `batch_id` is a
-- required column being added to a table that already has rows, and its
-- Prisma-level default (cuid()) can't backfill them: added as nullable
-- first, backfilled, then made NOT NULL.
--
-- Backfill choice: batch_id = id. Every pre-existing file was uploaded as
-- a single-sheet upload, i.e. each one IS its own batch of one — reusing
-- the row's own id gives every old row a unique, stable batch id without
-- inventing new random values.
ALTER TABLE "files" ADD COLUMN "batch_id" TEXT;
UPDATE "files" SET "batch_id" = "id";
ALTER TABLE "files" ALTER COLUMN "batch_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "files_company_id_batch_id_idx" ON "files"("company_id", "batch_id");

-- CreateTable
-- Sales Calendar — 18th official Import Template's real Postgres table
-- (the one Canonical Entity materialized instead of re-parsed from Excel
-- on every RIE query). See schema.prisma's SalesCalendar doc comment.
CREATE TABLE "sales_calendars" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "calendar_date" DATE NOT NULL,
    "day" TEXT,
    "week" INTEGER,
    "month" INTEGER,
    "quarter" INTEGER,
    "year" INTEGER,
    "working_day" BOOLEAN,
    "holiday" TEXT,
    "season" TEXT,
    "ramadan" BOOLEAN,
    "promotion_season" TEXT,
    "source_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per date per company — a re-upload of a refreshed calendar
-- upserts existing dates instead of accumulating duplicates.
CREATE UNIQUE INDEX "sales_calendars_company_id_calendar_date_key" ON "sales_calendars"("company_id", "calendar_date");

-- CreateIndex
CREATE INDEX "sales_calendars_company_id_year_month_idx" ON "sales_calendars"("company_id", "year", "month");

-- AddForeignKey
ALTER TABLE "sales_calendars" ADD CONSTRAINT "sales_calendars_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_calendars" ADD CONSTRAINT "sales_calendars_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
