ALTER TABLE "prospects"
  ADD COLUMN "score_components" JSONB,
  ADD COLUMN "score_input_fingerprint" TEXT;
