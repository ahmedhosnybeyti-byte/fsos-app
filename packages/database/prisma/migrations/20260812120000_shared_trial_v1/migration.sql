ALTER TABLE "users"
  ADD COLUMN "trial_starts_at" TIMESTAMP(3),
  ADD COLUMN "trial_ends_at" TIMESTAMP(3);

CREATE INDEX "users_trial_ends_at_idx" ON "users"("trial_ends_at");
