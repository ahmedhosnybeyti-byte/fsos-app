CREATE TYPE "UserActivityActorType" AS ENUM ('USER', 'SYSTEM');
CREATE TYPE "UserActivityOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');
CREATE TYPE "UserRiskLevel" AS ENUM ('NORMAL', 'WATCH', 'SUSPICIOUS', 'HIGH_RISK');

CREATE TABLE "user_activity_events" (
  "id" TEXT NOT NULL, "event_version" INTEGER NOT NULL DEFAULT 1, "category" TEXT NOT NULL,
  "type" TEXT NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_type" "UserActivityActorType" NOT NULL, "actor_user_id" TEXT, "subject_user_id" TEXT,
  "actor_role" TEXT, "company_id" TEXT, "branch_id" TEXT, "org_path" JSONB,
  "target_type" TEXT, "target_id" TEXT, "outcome" "UserActivityOutcome" NOT NULL DEFAULT 'SUCCESS',
  "source" TEXT NOT NULL, "session_id" TEXT, "request_id" TEXT, "ip_address" TEXT,
  "user_agent" TEXT, "metadata" JSONB, CONSTRAINT "user_activity_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_activity_security_alerts" (
  "id" TEXT NOT NULL, "type" TEXT NOT NULL, "company_id" TEXT, "subject_user_id" TEXT,
  "event_id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_activity_security_alerts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "user_risk_states" (
  "user_id" TEXT NOT NULL, "company_id" TEXT, "level" "UserRiskLevel" NOT NULL DEFAULT 'NORMAL',
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "user_risk_states_pkey" PRIMARY KEY ("user_id")
);
CREATE TABLE "user_activity_daily_summaries" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "company_id" TEXT NOT NULL,
  "activity_date" DATE NOT NULL, "total_events" INTEGER NOT NULL DEFAULT 0,
  "business_events" INTEGER NOT NULL DEFAULT 0, "denied_events" INTEGER NOT NULL DEFAULT 0,
  "security_alerts" INTEGER NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_activity_daily_summaries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_activity_security_alerts_event_id_key" ON "user_activity_security_alerts"("event_id");
CREATE UNIQUE INDEX "user_activity_daily_summaries_user_id_activity_date_key" ON "user_activity_daily_summaries"("user_id", "activity_date");
CREATE INDEX "user_activity_events_company_id_timestamp_idx" ON "user_activity_events"("company_id", "timestamp");
CREATE INDEX "user_activity_events_subject_user_id_timestamp_idx" ON "user_activity_events"("subject_user_id", "timestamp");
CREATE INDEX "user_activity_events_actor_user_id_timestamp_idx" ON "user_activity_events"("actor_user_id", "timestamp");
CREATE INDEX "user_activity_events_type_timestamp_idx" ON "user_activity_events"("type", "timestamp");
CREATE INDEX "user_activity_security_alerts_company_id_created_at_idx" ON "user_activity_security_alerts"("company_id", "created_at");
CREATE INDEX "user_activity_security_alerts_subject_user_id_created_at_idx" ON "user_activity_security_alerts"("subject_user_id", "created_at");
CREATE INDEX "user_risk_states_company_id_level_idx" ON "user_risk_states"("company_id", "level");
CREATE INDEX "user_activity_daily_summaries_company_id_activity_date_idx" ON "user_activity_daily_summaries"("company_id", "activity_date");
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_activity_events" ADD CONSTRAINT "user_activity_events_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_activity_security_alerts" ADD CONSTRAINT "user_activity_security_alerts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "user_activity_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_risk_states" ADD CONSTRAINT "user_risk_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_activity_daily_summaries" ADD CONSTRAINT "user_activity_daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_activity_daily_summaries" ADD CONSTRAINT "user_activity_daily_summaries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
