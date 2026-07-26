-- CreateEnum
CREATE TYPE "CompanyAccountType" AS ENUM ('COMPANY', 'INDEPENDENT');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "account_type" "CompanyAccountType";

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "trial_max_active_customers" INTEGER NOT NULL DEFAULT 500,
ALTER COLUMN "trial_duration_days" SET DEFAULT 7;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "whatsapp" TEXT;
