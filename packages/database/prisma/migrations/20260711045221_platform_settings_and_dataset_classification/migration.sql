-- AlterTable
ALTER TABLE "files" ADD COLUMN     "dataset_type_confidence" DOUBLE PRECISION,
ADD COLUMN     "dataset_type_confirmed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sheet_index" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform_settings',
    "trial_enabled" BOOLEAN NOT NULL DEFAULT true,
    "trial_duration_days" INTEGER NOT NULL DEFAULT 14,
    "default_plan_code" TEXT NOT NULL DEFAULT 'trial',
    "auto_start_trial_on_registration" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
