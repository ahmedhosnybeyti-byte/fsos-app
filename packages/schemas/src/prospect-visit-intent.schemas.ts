import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const createProspectVisitIntentSchema = z
  .object({
    prospectId: z.string().trim().min(1).max(200).optional(),
    companyOpportunityId: z.string().trim().min(1).max(200).optional(),
    scheduledFor: isoDate,
    assignedToUserId: z.string().trim().min(1).max(200).optional(),
  })
  .refine((value) => Number(Boolean(value.prospectId)) + Number(Boolean(value.companyOpportunityId)) === 1, {
    message: "أرسل prospectId أو companyOpportunityId — واحدًا منهما فقط",
    path: ["prospectId"],
  });
export type CreateProspectVisitIntentInput = z.infer<typeof createProspectVisitIntentSchema>;
export const prospectVisitIntentStatusSchema = z.enum(["PLANNED", "COMPLETED", "CANCELLED"]);
export const updateProspectVisitIntentStatusSchema = z.object({ status: prospectVisitIntentStatusSchema });
export type UpdateProspectVisitIntentStatusInput = z.infer<typeof updateProspectVisitIntentStatusSchema>;
export const radarOpportunityVisitResultSchema = z
  .object({
    result: z.enum(["VISITED", "AGREED", "ORDERED", "UNSUCCESSFUL"]),
    outcome: z.string().trim().max(2_000).nullable().optional(),
    notes: z.string().trim().max(4_000).nullable().optional(),
    orderValue: z.number().nonnegative().max(999_999_999_999).nullable().optional(),
    orderQuantity: z.number().nonnegative().max(999_999_999_999).nullable().optional(),
  })
  .refine((value) => value.result !== "ORDERED" || value.orderValue != null || value.orderQuantity != null, {
    message: "تسجيل الطلبية يتطلب قيمة أو كمية مؤكدة",
    path: ["orderValue"],
  });
export type RadarOpportunityVisitResultInput = z.infer<typeof radarOpportunityVisitResultSchema>;
export const prospectVisitIntentListQuerySchema = z.object({ scheduledFor: isoDate.optional() });
export type ProspectVisitIntentListQuery = z.infer<typeof prospectVisitIntentListQuerySchema>;
