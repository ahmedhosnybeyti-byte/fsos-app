-- The Prisma model already records when a GPT launch token starts a session.
-- Add the missing production column so minting a launch code does not fail.
ALTER TABLE "gpt_launch_tokens" ADD COLUMN "session_started_at" TIMESTAMP(3);