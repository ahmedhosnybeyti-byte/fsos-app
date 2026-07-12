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

export const COMPANY_STATUSES = ["ACTIVE", "SUSPENDED", "DISABLED"] as const;
export const companyStatusSchema = z.enum(COMPANY_STATUSES);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

export const USER_STATUSES = ["ACTIVE", "INVITED", "DISABLED"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

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
  "Customers",
  "Payments",
  "Returns",
  "Products",
  "Inventory",
  "Pricing",
  "Routes",
  "Visits",
  "Collections",
  "Targets",
  "Competitors",
] as const;
