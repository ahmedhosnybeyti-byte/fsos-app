-- CreateEnum
CREATE TYPE "CompanyLifecycleEvent" AS ENUM ('CREATE', 'ACTIVATE', 'SUSPEND', 'REACTIVATE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "OrgUnitStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('DRAFT', 'CONFIGURING', 'CONNECTED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSourceHealthStatus" AS ENUM ('HEALTHY', 'WARNING', 'ERROR', 'OFFLINE');

-- CreateEnum
CREATE TYPE "RefreshType" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "RefreshRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyStatus" ADD VALUE 'DRAFT';
ALTER TYPE "CompanyStatus" ADD VALUE 'CONFIGURING';
ALTER TYPE "CompanyStatus" ADD VALUE 'ARCHIVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserStatus" ADD VALUE 'PENDING';
ALTER TYPE "UserStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "UserStatus" ADD VALUE 'LOCKED';
ALTER TYPE "UserStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "org_unit_id" TEXT;

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "country" TEXT,
    "city" TEXT,
    "time_zone" TEXT,
    "currency" TEXT,
    "default_language" TEXT,
    "fiscal_year_start" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_type_definitions" (
    "id" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowed_parent_codes" TEXT[],
    "allowed_child_codes" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_unit_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_units" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'BRANCH',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "job_title" TEXT,
    "org_unit_id" TEXT,
    "manager_id" TEXT,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'DRAFT',
    "hire_date" TIMESTAMP(3),
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_types" (
    "id" TEXT NOT NULL,
    "type_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "data_category" TEXT,
    "status" "DataSourceStatus" NOT NULL DEFAULT 'DRAFT',
    "connection_config" JSONB,
    "auth_method" TEXT,
    "credentials_cipher" TEXT,
    "owner_user_id" TEXT,
    "last_tested_at" TIMESTAMP(3),
    "last_test_result" TEXT,
    "provider" TEXT,
    "health_status" "DataSourceHealthStatus" NOT NULL DEFAULT 'OFFLINE',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "last_refresh_at" TIMESTAMP(3),
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_definitions" (
    "id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "description" TEXT,
    "expected_columns" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schema_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "data_source_id" TEXT NOT NULL,
    "triggered_by_user_id" TEXT,
    "refresh_type" "RefreshType" NOT NULL DEFAULT 'FULL',
    "status" "RefreshRunStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "imported_records" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "data_quality_score" DOUBLE PRECISION,
    "result_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "policy_type" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_company_id_key" ON "company_profiles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_type_definitions_type_code_key" ON "org_unit_type_definitions"("type_code");

-- CreateIndex
CREATE INDEX "org_units_company_id_parent_id_idx" ON "org_units"("company_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_company_id_type_code_key" ON "org_units"("company_id", "type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_company_id_org_unit_id_idx" ON "employees"("company_id", "org_unit_id");

-- CreateIndex
CREATE INDEX "employees_company_id_manager_id_idx" ON "employees"("company_id", "manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_employee_code_key" ON "employees"("company_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_types_type_code_key" ON "data_source_types"("type_code");

-- CreateIndex
CREATE INDEX "data_sources_company_id_type_idx" ON "data_sources"("company_id", "type");

-- CreateIndex
CREATE INDEX "data_sources_company_id_status_idx" ON "data_sources"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_company_id_name_key" ON "data_sources"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schema_definitions_entity_name_key" ON "schema_definitions"("entity_name");

-- CreateIndex
CREATE INDEX "refresh_runs_company_id_status_idx" ON "refresh_runs"("company_id", "status");

-- CreateIndex
CREATE INDEX "refresh_runs_data_source_id_created_at_idx" ON "refresh_runs"("data_source_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_policies_company_id_policy_type_key" ON "company_policies"("company_id", "policy_type");

-- CreateIndex
CREATE INDEX "users_org_unit_id_idx" ON "users"("org_unit_id");

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_type_fkey" FOREIGN KEY ("type") REFERENCES "org_unit_type_definitions"("type_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_type_fkey" FOREIGN KEY ("type") REFERENCES "data_source_types"("type_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_policies" ADD CONSTRAINT "company_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
