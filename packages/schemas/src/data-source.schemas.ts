import { z } from "zod";
import { dataSourceHealthStatusSchema, dataSourceStatusSchema } from "./enums";

// Phase 6 — Data Sources Management. Pure definition/metadata management —
// no analysis, no business rules, no automatic import, no live data reads.
// Uploading/replacing/syncing the underlying data belongs to Phase 7
// (Refresh Center), not here.

const TYPE_CODE_PATTERN = /^[A-Z0-9_]+$/;

export const dataSourceTypeSchema = z.object({
  id: z.string(),
  typeCode: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type DataSourceType = z.infer<typeof dataSourceTypeSchema>;

// The Data Source Type Registry itself — a new type is a data insert, never
// a schema/code change (same reuse pattern as Phase 3's Organizational Type
// Registry).
export const createDataSourceTypeSchema = z.object({
  typeCode: z.string().trim().min(1).max(50).regex(TYPE_CODE_PATTERN, "استخدم حروف إنجليزية كبيرة وأرقام و _ فقط"),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional(),
});
export type CreateDataSourceTypeInput = z.infer<typeof createDataSourceTypeSchema>;

// Non-secret connection settings only (host, port, database name, base URL,
// region, ...) — kept as a free-form record rather than a rigid per-type
// shape, since the exact fields vary by source type and new types must be
// addable without a schema change.
const connectionConfigSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional();

// Write-only: accepted on create/update, encrypted at rest, never echoed
// back in any response (the constitution explicitly forbids showing
// passwords/keys/credentials to the user).
const credentialsSchema = z.record(z.string(), z.string()).optional();

export const createDataSourceSchema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  dataCategory: z.string().trim().max(100).optional(),
  connectionConfig: connectionConfigSchema,
  authMethod: z.string().trim().max(50).optional(),
  credentials: credentialsSchema,
  ownerUserId: z.string().trim().min(1).optional().nullable(),
});
export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;

export const updateDataSourceSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  dataCategory: z.string().trim().max(100).optional().nullable(),
  status: dataSourceStatusSchema.optional(),
  connectionConfig: connectionConfigSchema,
  authMethod: z.string().trim().max(50).optional().nullable(),
  credentials: credentialsSchema,
  ownerUserId: z.string().trim().min(1).optional().nullable(),
});
export type UpdateDataSourceInput = z.infer<typeof updateDataSourceSchema>;

// Public shape — deliberately has no credentials/credentialsCipher field.
export const dataSourceSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  dataCategory: z.string().nullable(),
  status: dataSourceStatusSchema,
  connectionConfig: z.record(z.string(), z.unknown()).nullable(),
  authMethod: z.string().nullable(),
  hasCredentials: z.boolean(),
  ownerUserId: z.string().nullable(),
  lastTestedAt: z.union([z.string(), z.date()]).nullable(),
  lastTestResult: z.string().nullable(),
  // Phase 7 additions — populated by the Data Source Platform / Refresh
  // Platform layers, not by Phase 6 code paths.
  provider: z.string().nullable(),
  healthStatus: dataSourceHealthStatusSchema,
  schemaVersion: z.number(),
  lastRefreshAt: z.union([z.string(), z.date()]).nullable(),
  lastValidatedAt: z.union([z.string(), z.date()]).nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type DataSource = z.infer<typeof dataSourceSchema>;

export const testDataSourceConnectionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  testedAt: z.union([z.string(), z.date()]),
});
export type TestDataSourceConnectionResult = z.infer<typeof testDataSourceConnectionResultSchema>;
