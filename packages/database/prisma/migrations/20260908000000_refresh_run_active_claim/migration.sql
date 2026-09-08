-- Only one active refresh may claim a data source. This is intentionally a
-- partial index: completed and failed runs remain historical records.
CREATE UNIQUE INDEX "refresh_runs_one_active_per_data_source"
ON "refresh_runs" ("data_source_id")
WHERE "status" IN ('QUEUED', 'RUNNING');
