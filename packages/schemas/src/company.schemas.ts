import { z } from "zod";
import { companyStatusSchema } from "./enums";

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: companyStatusSchema.optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
