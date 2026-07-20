import { z } from "zod";
import { companyStatusSchema, orgUnitStatusSchema } from "./enums";

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: companyStatusSchema.optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// --- Phase 2: Company Lifecycle Management ---

export const companyProfileSchema = z.object({
  logoUrl: z.string().url().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  timeZone: z.string().nullable(),
  currency: z.string().nullable(),
  defaultLanguage: z.string().nullable(),
  fiscalYearStart: z.string().nullable(),
  contactEmail: z.string().email().nullable(),
  contactPhone: z.string().nullable(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

// Customer Discovery provider settings ride on the company profile:
// discoveryProvider picks the "search around me" backend (OSM = free
// OpenStreetMap default, no key needed; GOOGLE = the company's own Google
// Places key). This enum lives in the API/validation layer only — it is how
// the code's provider layer registers which providers exist today; it is
// NOT the database schema, which stores discoveryProvider as free text and
// never needs a migration when a new provider id is added here.
// discoveryApiKey is a generic, WRITE-ONLY credential string for whichever
// provider is selected (today only GOOGLE needs one; OSM ignores it). It is
// encrypted at rest — keyed internally by provider id — and never echoed
// back by the API (responses expose hasDiscoveryCredentials: boolean
// instead, mirroring data-sources' hasCredentials convention); sending an
// empty string clears the stored credential for the selected provider.
export const discoveryProviderSchema = z.enum(["OSM", "GOOGLE"]);
export type DiscoveryProvider = z.infer<typeof discoveryProviderSchema>;

export const updateCompanyProfileSchema = z.object({
  logoUrl: z.string().url().max(500).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  timeZone: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().max(10).optional().nullable(),
  defaultLanguage: z.string().trim().max(10).optional().nullable(),
  fiscalYearStart: z.string().trim().max(20).optional().nullable(),
  contactEmail: z.string().trim().email().max(255).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  discoveryProvider: discoveryProviderSchema.optional(),
  discoveryApiKey: z.string().trim().max(300).optional(),
});
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;

// Branch = the MVP-level org unit exposed to the product. Internally stored
// as an OrgUnit row with type=BRANCH; the generic name/type is intentionally
// not surfaced in this schema so the frontend/API contract stays a plain
// "Branch" until a future phase activates Region/DistributionCenter/Route.
export const createBranchSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  status: orgUnitStatusSchema.optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const branchSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  code: z.string(),
  name: z.string(),
  status: orgUnitStatusSchema,
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type Branch = z.infer<typeof branchSchema>;

// --- Phase 3: Organizational Structure Management ---
// Pure metadata/structure schemas only — no business logic, permissions, or
// employee/customer/route linkage. That remains exclusively RIE's domain.

const TYPE_CODE_PATTERN = /^[A-Z0-9_]+$/;

export const orgUnitTypeDefinitionSchema = z.object({
  id: z.string(),
  typeCode: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  allowedParentCodes: z.array(z.string()),
  allowedChildCodes: z.array(z.string()),
  isSystem: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type OrgUnitTypeDefinition = z.infer<typeof orgUnitTypeDefinitionSchema>;

// The Organizational Type Registry itself: defines what unit types exist and
// how they may nest ("ROOT" = may sit directly under the Company). A new
// unit type is added by creating one of these rows — no schema/code change.
export const createOrgUnitTypeDefinitionSchema = z.object({
  typeCode: z.string().trim().min(1).max(50).regex(TYPE_CODE_PATTERN, "استخدم حروف إنجليزية كبيرة وأرقام و _ فقط"),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
  allowedParentCodes: z.array(z.string().trim().min(1)).default([]),
  allowedChildCodes: z.array(z.string().trim().min(1)).default([]),
});
export type CreateOrgUnitTypeDefinitionInput = z.infer<typeof createOrgUnitTypeDefinitionSchema>;

// Generic Organizational Unit — the engine underneath Branch. `type` must
// match an existing OrgUnitTypeDefinition.typeCode (validated server-side).
export const createOrgUnitSchema = z.object({
  type: z.string().trim().min(1).max(50),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  parentId: z.string().trim().min(1).optional().nullable(),
});
export type CreateOrgUnitInput = z.infer<typeof createOrgUnitSchema>;

export const updateOrgUnitSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  status: orgUnitStatusSchema.optional(),
});
export type UpdateOrgUnitInput = z.infer<typeof updateOrgUnitSchema>;

export const moveOrgUnitSchema = z.object({
  newParentId: z.string().trim().min(1).nullable(),
});
export type MoveOrgUnitInput = z.infer<typeof moveOrgUnitSchema>;

export const orgUnitSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  parentId: z.string().nullable(),
  type: z.string(),
  code: z.string(),
  name: z.string(),
  path: z.string(),
  status: orgUnitStatusSchema,
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type OrgUnit = z.infer<typeof orgUnitSchema>;
