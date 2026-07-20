// RIE — Entity Provider abstraction.
//
// Navigation Engine and Query Execution Engine never talk to Prisma, Excel
// files, or any other storage mechanism directly. They only ever talk to an
// EntityProvider. Today the platform's actual system-of-record for 16 of the
// 19 Canonical Entities is uploaded Excel datasets (see ExcelDatasetProvider);
// two (Companies, Employees) additionally exist as real Prisma tables. When
// FSOS eventually migrates some or all entities into first-class database
// tables, a new provider (e.g. PrismaEntityProvider) implements this exact
// same interface and is swapped in via the ENTITY_PROVIDER DI token —
// Navigation Engine, Query Execution Engine, and everything built on top of
// them require zero changes.
//
// This boundary exists specifically because of a real architectural gap
// found while building Navigation Engine: the RIE Constitution / Canonical
// Database / Relationship Registry all assume relational FK-backed storage,
// but the running platform stores most business entities as row data inside
// user-uploaded Excel workbooks. See the Arabic report delivered alongside
// this module for the full explanation. This file is the seam that isolates
// RIE's logic from that gap.

export interface EntityRecord {
  readonly [field: string]: unknown;
}

export type EntityFilterOperator = "eq" | "in" | "gte" | "lte" | "between" | "contains";

export interface EntityFieldFilter {
  /** Field name as it appears on returned EntityRecords (see EntityQueryResult.fields). */
  field: string;
  op: EntityFilterOperator;
  value: unknown;
}

export interface EntityQueryContext {
  companyId: string;
  /** Present when the query must be scoped by the requesting user's role (hierarchy visibility). Omit for system-level/unscoped reads. */
  requestingUser?: {
    roleCode: string;
    email: string;
  };
}

export interface EntityQueryOptions extends EntityQueryContext {
  filters?: readonly EntityFieldFilter[];
  limit?: number;
}

export type EntityUnavailableReason = "NO_DATA_SOURCE_MAPPED" | "NO_ACTIVE_DATASET" | "PROVIDER_ERROR";

export interface EntityQueryResult {
  /** Literal Canonical Database entity name, e.g. "Customers" (see canonical-entities.data.ts). */
  entityName: string;
  /** False when this provider has no way to answer for this entity at all (see EntityUnavailableReason) — distinct from "available but zero rows matched". */
  available: boolean;
  unavailableReason?: EntityUnavailableReason;
  records: readonly EntityRecord[];
  /** The actual field/column names present on `records` for this call, so callers can resolve a Registry foreignKey column name against real data. */
  fields: readonly string[];
  warnings: readonly string[];
}

/**
 * Storage-agnostic contract. Every method is read-only — Entity Providers
 * never write, matching RIE's Golden Rule (RIE only reads, verifies, and
 * navigates; it never mutates business data).
 */
export interface EntityProvider {
  getRecords(entityName: string, options: EntityQueryOptions): Promise<EntityQueryResult>;
  isAvailable(entityName: string, companyId: string): Promise<boolean>;
}

export const ENTITY_PROVIDER = Symbol("ENTITY_PROVIDER");
