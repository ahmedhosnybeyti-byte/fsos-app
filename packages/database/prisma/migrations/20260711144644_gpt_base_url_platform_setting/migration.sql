-- AlterTable
-- There is one Custom GPT for the whole platform, not one per company, so
-- its base URL becomes platform config (editable by SUPER_ADMIN) instead of
-- a per-company field.
ALTER TABLE "platform_settings" ADD COLUMN     "gpt_base_url" TEXT NOT NULL DEFAULT 'https://chatgpt.com/g/g-6a5188788cc0819196ca83b39f686d74-field-sales-os';

-- AlterTable
ALTER TABLE "gpts" DROP COLUMN "chatgpt_url";
