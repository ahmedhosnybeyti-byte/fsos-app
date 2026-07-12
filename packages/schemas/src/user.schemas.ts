import { z } from "zod";
import { roleCodeSchema, userStatusSchema } from "./enums";
import { passwordSchema } from "./auth.schemas";

// Company admins create users within their own company and assign the role
// — the platform never infers or assigns it.
export const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(2).max(120),
  roleCode: roleCodeSchema.exclude(["SUPER_ADMIN"]),
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  roleCode: roleCodeSchema.exclude(["SUPER_ADMIN"]).optional(),
  status: userStatusSchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
