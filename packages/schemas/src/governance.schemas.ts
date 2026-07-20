import { z } from "zod";
import { companyPolicyTypeSchema } from "./enums";

// Phase 9 — Security, Governance & Audit.

// --- Company Policy Engine ---
export const companyPolicySchema = z.object({
  id: z.string(),
  companyId: z.string(),
  policyType: companyPolicyTypeSchema,
  value: z.record(z.string(), z.unknown()),
  version: z.number(),
  isActive: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type CompanyPolicy = z.infer<typeof companyPolicySchema>;

export const upsertCompanyPolicySchema = z.object({
  policyType: companyPolicyTypeSchema,
  value: z.record(z.string(), z.unknown()),
  isActive: z.boolean().optional(),
});
export type UpsertCompanyPolicyInput = z.infer<typeof upsertCompanyPolicySchema>;

// --- Compliance Monitoring ---
// Intentionally shallow for this MVP: reports whether each known policy
// type has an active, defined policy for the company. Deep substantive
// compliance (e.g. verifying every user's password actually satisfies the
// active PASSWORD_POLICY) is explicitly out of scope here — see the Phase 9
// report's "architectural decisions" section.
export const compliancePolicyStatusSchema = z.object({
  policyType: companyPolicyTypeSchema,
  hasPolicy: z.boolean(),
  isCompliant: z.boolean(),
  notes: z.string().optional(),
});
export type CompliancePolicyStatus = z.infer<typeof compliancePolicyStatusSchema>;

export const complianceOverviewSchema = z.object({
  companyId: z.string(),
  policies: z.array(compliancePolicyStatusSchema),
  overallCompliant: z.boolean(),
  checkedAt: z.union([z.string(), z.date()]),
});
export type ComplianceOverview = z.infer<typeof complianceOverviewSchema>;

// --- Observability (platform-wide, SUPER_ADMIN only) ---
export const platformObservabilitySchema = z.object({
  companiesCount: z.number(),
  usersCount: z.number(),
  refreshRunsCount: z.number(),
  refreshRunsLast24h: z.number(),
  avgRefreshDurationMs: z.number().nullable(),
  importSuccessRate: z.number().nullable(),
  dataSourceUsageRate: z.number().nullable(),
  securityOperationsCount: z.number(),
  auditOperationsCount: z.number(),
  refreshErrorRate: z.number().nullable(),
  generatedAt: z.union([z.string(), z.date()]),
});
export type PlatformObservability = z.infer<typeof platformObservabilitySchema>;
