-- Platform-wide GPT usage counters. The initial backfill preserves the
-- historical response exactly; subsequent increments are written atomically
-- with each usage event by UsageAnalyticsService.
CREATE TABLE "platform_gpt_usage_rollups" (
    "event_type" "GptUsageEventType" NOT NULL,
    "event_count" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_gpt_usage_rollups_pkey" PRIMARY KEY ("event_type")
);

INSERT INTO "platform_gpt_usage_rollups" ("event_type", "event_count")
SELECT "event_type", COUNT(*)
FROM "gpt_usage_events"
GROUP BY "event_type";
