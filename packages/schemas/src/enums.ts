// Domain enums shared between apps/web and apps/api. These deliberately
// mirror packages/database's Prisma enums but are declared independently —
// the frontend must never depend on @prisma/client, and the API maps
// between the two at its boundary (DTOs in <-> Prisma models out).

import { z } from "zod";

export const ROLE_CODES = [
  "SUPER_ADMIN",
  "COMPANY_ADMIN",
  "MANAGER",
  "SUPERVISOR",
  "SALES_REP",
] as const;
export const roleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof roleCodeSchema>;

export const COMPANY_STATUSES = ["DRAFT", "CONFIGURING", "ACTIVE", "SUSPENDED", "ARCHIVED", "DISABLED"] as const;
export const companyStatusSchema = z.enum(COMPANY_STATUSES);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

// Company Lifecycle Management (Phase 2) — audit-logged transitions, no
// dedicated table; recorded via the existing generic AuditLog service with
// action = `company.lifecycle.<event>`.
export const COMPANY_LIFECYCLE_EVENTS = ["CREATE", "ACTIVATE", "SUSPEND", "REACTIVATE", "ARCHIVE"] as const;
export const companyLifecycleEventSchema = z.enum(COMPANY_LIFECYCLE_EVENTS);
export type CompanyLifecycleEvent = z.infer<typeof companyLifecycleEventSchema>;

// Phase 3: organizational unit types are no longer a fixed enum — they're
// rows in the OrgUnitTypeDefinition registry (see company.schemas.ts), so a
// new type can be added without touching this file. `type` on an OrgUnit is
// just a free string that must match an existing registry `typeCode`
// (validated server-side, not by Zod, since the valid set is data not code).

export const ORG_UNIT_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const orgUnitStatusSchema = z.enum(ORG_UNIT_STATUSES);
export type OrgUnitStatus = z.infer<typeof orgUnitStatusSchema>;

// Phase 4 — User & Identity Management lifecycle. PENDING/SUSPENDED/LOCKED/
// ARCHIVED are additive on top of the original ACTIVE/INVITED/DISABLED — no
// behavior change for existing rows; the login gate already only allows
// ACTIVE, which already matches Phase 4's "only Active may log in" rule.
export const USER_STATUSES = ["PENDING", "ACTIVE", "INVITED", "SUSPENDED", "LOCKED", "DISABLED", "ARCHIVED"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

// Phase 5 — Employee Management lifecycle. Distinct from UserStatus: an
// Employee is a business record, never a login account.
export const EMPLOYMENT_STATUSES = ["DRAFT", "ACTIVE", "ON_LEAVE", "SUSPENDED", "INACTIVE", "ARCHIVED"] as const;
export const employmentStatusSchema = z.enum(EMPLOYMENT_STATUSES);
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;

// Phase 6 — Data Sources Management lifecycle. A DataSource *definition*'s
// status — unrelated to FileStatus (which tracks an uploaded file's
// processing state).
export const DATA_SOURCE_STATUSES = ["DRAFT", "CONFIGURING", "CONNECTED", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const dataSourceStatusSchema = z.enum(DATA_SOURCE_STATUSES);
export type DataSourceStatus = z.infer<typeof dataSourceStatusSchema>;

// Phase 7 — Data Source Platform. System-computed usability signal, distinct
// from the human-set DataSourceStatus above.
export const DATA_SOURCE_HEALTH_STATUSES = ["HEALTHY", "WARNING", "ERROR", "OFFLINE"] as const;
export const dataSourceHealthStatusSchema = z.enum(DATA_SOURCE_HEALTH_STATUSES);
export type DataSourceHealthStatus = z.infer<typeof dataSourceHealthStatusSchema>;

// Phase 8 — Refresh Platform.
export const REFRESH_TYPES = ["FULL", "INCREMENTAL"] as const;
export const refreshTypeSchema = z.enum(REFRESH_TYPES);
export type RefreshType = z.infer<typeof refreshTypeSchema>;

export const REFRESH_RUN_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export const refreshRunStatusSchema = z.enum(REFRESH_RUN_STATUSES);
export type RefreshRunStatus = z.infer<typeof refreshRunStatusSchema>;

// Phase 9 — Company Policy Engine. Fixed vocabulary straight from the
// constitution's own examples — deliberately not a dynamic registry table
// (see CompanyPolicy's schema comment for why).
export const COMPANY_POLICY_TYPES = [
  "ORGANIZATIONAL_POLICY",
  "PASSWORD_POLICY",
  "REFRESH_POLICY",
  "EMPLOYEE_ASSIGNMENT_POLICY",
  "PERMISSION_POLICY",
  "ARCHIVING_POLICY",
] as const;
export const companyPolicyTypeSchema = z.enum(COMPANY_POLICY_TYPES);
export type CompanyPolicyType = z.infer<typeof companyPolicyTypeSchema>;

// Phase 9 — Platform Events. The exact event names the constitution lists;
// emitted in-process by PlatformEventsService and mirrored into AuditLog.
export const PLATFORM_EVENT_NAMES = [
  "CompanyCreated",
  "CompanyUpdated",
  "CompanyActivated",
  "CompanyArchived",
  "OrganizationalUnitCreated",
  "OrganizationalUnitMoved",
  "EmployeeCreated",
  "EmployeeImported",
  "EmployeeUpdated",
  "DataSourceRegistered",
  "RefreshStarted",
  "RefreshCompleted",
  "RefreshFailed",
] as const;
export const platformEventNameSchema = z.enum(PLATFORM_EVENT_NAMES);
export type PlatformEventName = z.infer<typeof platformEventNameSchema>;

export const SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const SUBSCRIPTION_PAYMENT_STATUSES = ["PAID", "UNPAID"] as const;
export const subscriptionPaymentStatusSchema = z.enum(SUBSCRIPTION_PAYMENT_STATUSES);
export type SubscriptionPaymentStatus = z.infer<typeof subscriptionPaymentStatusSchema>;

export const BILLING_INTERVALS = ["MONTHLY", "YEARLY", "ONE_TIME"] as const;
export const billingIntervalSchema = z.enum(BILLING_INTERVALS);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const PLAN_CODES = ["trial", "basic", "professional", "enterprise"] as const;
export const planCodeSchema = z.enum(PLAN_CODES);
export type PlanCode = z.infer<typeof planCodeSchema>;

export const PAYMENT_PROVIDER_TYPES = ["MANUAL", "STRIPE", "PAYMOB", "OTHER"] as const;
export const paymentProviderTypeSchema = z.enum(PAYMENT_PROVIDER_TYPES);
export type PaymentProviderType = z.infer<typeof paymentProviderTypeSchema>;

export const PAYMENT_RECORD_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"] as const;
export const paymentRecordStatusSchema = z.enum(PAYMENT_RECORD_STATUSES);
export type PaymentRecordStatus = z.infer<typeof paymentRecordStatusSchema>;

export const FILE_STATUSES = ["PROCESSING", "READY", "FAILED"] as const;
export const fileStatusSchema = z.enum(FILE_STATUSES);
export type FileStatus = z.infer<typeof fileStatusSchema>;

export const GPT_USAGE_EVENT_TYPES = [
  "LAUNCH_TOKEN_ISSUED",
  "VERIFY_ACCESS",
  "DATASET_FETCH",
  "ANALYSIS_RUN",
] as const;
export const gptUsageEventTypeSchema = z.enum(GPT_USAGE_EVENT_TYPES);
export type GptUsageEventType = z.infer<typeof gptUsageEventTypeSchema>;

// Datasets represent business data sources, not organizational roles — the
// GPT decides which dataset(s) are relevant to a question, not the platform.
// This is deliberately NOT a closed enum: a company can label a dataset
// anything. The list below only seeds the upload dropdown's presets; the
// validation schema (file.schemas.ts) accepts any non-empty string so a new
// category never requires a code change.
export const SUGGESTED_DATASET_TYPES = [
  "Invoices",
  "Invoice Items",
  "Customers",
  "Payments",
  "Returns",
  "Products",
  "Inventory",
  "Pricing",
  "Routes",
  "Employees",
  "Visits",
  "Collections",
  "Targets",
  "Competitors",
] as const;
