-- Additive only: no existing company, file, RIE row or role grant is changed.
CREATE TYPE "CompanyOperatingMode" AS ENUM ('ANALYSIS_ONLY', 'SFA');

CREATE TABLE "company_operating_settings" (
  "company_id" TEXT NOT NULL,
  "operating_mode" "CompanyOperatingMode" NOT NULL DEFAULT 'ANALYSIS_ONLY',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_operating_settings_pkey" PRIMARY KEY ("company_id"),
  CONSTRAINT "company_operating_settings_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Register the capability without granting it to any existing role.
INSERT INTO "permissions" ("id", "code", "description")
VALUES ('sfa-access-v1', 'sfa.access', 'Access enabled company SFA operations')
ON CONFLICT ("code") DO NOTHING;
