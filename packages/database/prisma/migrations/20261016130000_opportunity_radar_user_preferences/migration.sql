CREATE TABLE "opportunity_radar_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_opportunity_id" TEXT NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "opportunity_radar_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "opportunity_radar_preferences_user_id_company_opportunity_id_key"
    ON "opportunity_radar_preferences"("user_id", "company_opportunity_id");
CREATE INDEX "opportunity_radar_preferences_hidden_idx"
    ON "opportunity_radar_preferences"("user_id", "is_hidden", "company_opportunity_id");
CREATE INDEX "opportunity_radar_preferences_favorite_idx"
    ON "opportunity_radar_preferences"("user_id", "is_favorite", "company_opportunity_id");

ALTER TABLE "opportunity_radar_preferences"
    ADD CONSTRAINT "opportunity_radar_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opportunity_radar_preferences"
    ADD CONSTRAINT "opportunity_radar_preferences_company_opportunity_id_fkey"
    FOREIGN KEY ("company_opportunity_id") REFERENCES "company_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
