import { z } from "zod";
import { employmentStatusSchema } from "./enums";

// Phase 5 — Employee Management. Employee is a Business Entity, kept fully
// independent from User (Identity Entity) — these schemas never carry
// login/password/permission fields, and orgUnitId/managerId are
// reference-only (no business logic implied).

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  fullName: z.string().trim().min(1).max(150),
  jobTitle: z.string().trim().max(150).optional(),
  orgUnitId: z.string().trim().min(1).optional().nullable(),
  managerId: z.string().trim().min(1).optional().nullable(),
  hireDate: z.union([z.string(), z.date()]).optional().nullable(),
  contactEmail: z.string().trim().email().max(255).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).max(150).optional(),
  jobTitle: z.string().trim().max(150).optional().nullable(),
  orgUnitId: z.string().trim().min(1).optional().nullable(),
  managerId: z.string().trim().min(1).optional().nullable(),
  status: employmentStatusSchema.optional(),
  hireDate: z.union([z.string(), z.date()]).optional().nullable(),
  contactEmail: z.string().trim().email().max(255).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const linkEmployeeUserSchema = z.object({
  userId: z.string().trim().min(1),
});
export type LinkEmployeeUserInput = z.infer<typeof linkEmployeeUserSchema>;

export const employeeSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  employeeCode: z.string(),
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  orgUnitId: z.string().nullable(),
  managerId: z.string().nullable(),
  status: employmentStatusSchema,
  hireDate: z.union([z.string(), z.date()]).nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  userId: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type Employee = z.infer<typeof employeeSchema>;

// Employee Context Resolver's output — the single official shape every
// future engine (RIE, Sales Team 360, Executive Studio, ...) is meant to
// consume instead of re-deriving this composition itself.
export const employeeContextSchema = z.object({
  employeeId: z.string(),
  companyId: z.string(),
  orgUnitId: z.string().nullable(),
  orgUnitPath: z.string().nullable(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
  status: employmentStatusSchema,
});
export type EmployeeContext = z.infer<typeof employeeContextSchema>;
