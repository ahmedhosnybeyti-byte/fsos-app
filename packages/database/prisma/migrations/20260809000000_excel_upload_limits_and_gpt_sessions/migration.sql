ALTER TABLE "companies" ADD COLUMN "max_excel_upload_size_mb" INTEGER;
UPDATE "companies" SET "max_excel_upload_size_mb" = 100 WHERE "max_excel_upload_size_mb" IS NULL;
ALTER TABLE "users" ADD COLUMN "gpt_launch_code_quota_day" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "gpt_launch_code_issued_today" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "gpt_launch_tokens" ADD COLUMN "session_token_hash" TEXT;
CREATE UNIQUE INDEX "gpt_launch_tokens_session_token_hash_key" ON "gpt_launch_tokens"("session_token_hash");
