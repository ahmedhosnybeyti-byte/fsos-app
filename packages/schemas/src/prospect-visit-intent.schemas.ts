import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const createProspectVisitIntentSchema = z.object({ prospectId: z.string().trim().min(1).max(200), scheduledFor: isoDate, assignedToUserId: z.string().trim().min(1).max(200).optional() });
export type CreateProspectVisitIntentInput = z.infer<typeof createProspectVisitIntentSchema>;
export const prospectVisitIntentStatusSchema = z.enum(["PLANNED", "COMPLETED", "CANCELLED"]);
export const updateProspectVisitIntentStatusSchema = z.object({ status: prospectVisitIntentStatusSchema });
export type UpdateProspectVisitIntentStatusInput = z.infer<typeof updateProspectVisitIntentStatusSchema>;
export const prospectVisitIntentListQuerySchema = z.object({ scheduledFor: isoDate.optional() });
export type ProspectVisitIntentListQuery = z.infer<typeof prospectVisitIntentListQuerySchema>;
