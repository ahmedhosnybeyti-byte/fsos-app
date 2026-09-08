-- A stable event key makes bounded audit-persistence retries idempotent.
ALTER TABLE "audit_logs" ADD COLUMN "event_key" TEXT;

-- Existing immutable rows receive their own primary key as an equally stable
-- key before the column becomes required for all future events.
UPDATE "audit_logs" SET "event_key" = "id" WHERE "event_key" IS NULL;

ALTER TABLE "audit_logs" ALTER COLUMN "event_key" SET NOT NULL;
CREATE UNIQUE INDEX "audit_logs_event_key_key" ON "audit_logs"("event_key");
