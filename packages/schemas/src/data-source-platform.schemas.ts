import { z } from "zod";
import { dataSourceHealthStatusSchema } from "./enums";

// Phase 7 — Data Source Platform. Purely additive infrastructure that wraps
// the existing Excel-based implementation (FilesService + dataset-query.util)
// behind a provider abstraction. Does NOT replace or redirect any existing
// engine's data-reading path. See apps/api/src/modules/data-source-platform.

// Basic Schema Registry — the official reference for FSOS's approved
// operational entity structure. `entityName` reuses the file classifier's
// existing `datasetType` vocabulary ("Customers", "Invoices", ...).
export const schemaColumnDefSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
});

export const schemaDefinitionSchema = z.object({
  id: z.string(),
  entityName: z.string(),
  description: z.string().nullable(),
  expectedColumns: z.array(schemaColumnDefSchema).nullable(),
  version: z.number(),
  isSystem: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type SchemaDefinition = z.infer<typeof schemaDefinitionSchema>;

export const createSchemaDefinitionSchema = z.object({
  entityName: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  expectedColumns: z.array(schemaColumnDefSchema).optional(),
});
export type CreateSchemaDefinitionInput = z.infer<typeof createSchemaDefinitionSchema>;

// Data Source Context — a runtime/read-only snapshot, never persisted as its
// own table (built fresh from the DataSource row + latest RefreshRun on
// every request that needs it).
export const dataSourceContextSchema = z.object({
  companyId: z.string(),
  dataSourceId: z.string(),
  sourceType: z.string(),
  provider: z.string().nullable(),
  schemaVersion: z.number(),
  healthStatus: dataSourceHealthStatusSchema,
});
export type DataSourceContext = z.infer<typeof dataSourceContextSchema>;

// Data Source Validation result — callable standalone (e.g. a "Validate"
// button) or as the first step of a Refresh (Phase 8).
export const dataSourceValidationResultSchema = z.object({
  valid: z.boolean(),
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      message: z.string().optional(),
    }),
  ),
  validatedAt: z.union([z.string(), z.date()]),
});
export type DataSourceValidationResult = z.infer<typeof dataSourceValidationResultSchema>;
