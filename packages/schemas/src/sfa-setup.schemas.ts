import { z } from "zod";

const warehouseFields = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();
export const createWarehouseSchema = warehouseFields;
export const warehouseBranchesSchema = z.object({
  branchIds: z.array(z.string().trim().min(1).max(100)).max(20)
    .refine(ids => new Set(ids).size === ids.length, "Duplicate branch IDs"),
}).strict();
export const updateWarehouseSchema = warehouseFields.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const warehouseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(80).optional(),
}).strict();
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type WarehouseListQuery = z.infer<typeof warehouseListQuerySchema>;
export interface SfaWarehouse {
  id: string; code: string; name: string; address: string | null; isActive: boolean;
}
export interface SfaWarehousePage { items: SfaWarehouse[]; page: number; pageSize: number; hasMore: boolean }
export type SetupItemKey = "products" | "customers" | "prices" | "employees" | "warehouses" | "openingBalances";
export interface CompanySetupChecklist {
  items: { key: SetupItemKey; status: "PRESENT" | "MISSING" | "NOT_AVAILABLE" }[];
}
