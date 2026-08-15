ALTER TABLE "users"
  ADD COLUMN "discovery_quota_day" TIMESTAMP(3),
  ADD COLUMN "discovery_issued_today" INTEGER NOT NULL DEFAULT 0;
