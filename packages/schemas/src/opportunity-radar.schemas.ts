import { z } from "zod";

export const MARKET_OPPORTUNITY_TYPES = ["PURCHASE", "EVENT", "PROACTIVE"] as const;
export const marketOpportunityTypeSchema = z.enum(MARKET_OPPORTUNITY_TYPES);
export type MarketOpportunityType = z.infer<typeof marketOpportunityTypeSchema>;

export const COMPANY_OPPORTUNITY_STATUSES = ["NEW", "REVIEWED", "CONTACTED", "QUALIFIED", "WON", "LOST", "EXPIRED"] as const;
export const companyOpportunityStatusSchema = z.enum(COMPANY_OPPORTUNITY_STATUSES);
export type CompanyOpportunityStatus = z.infer<typeof companyOpportunityStatusSchema>;

export const opportunityRadarListQuerySchema = z.object({
  type: marketOpportunityTypeSchema.optional(),
  view: z.enum(["ALL", "ACT_NOW"]).default("ALL"),
  status: companyOpportunityStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type OpportunityRadarListQuery = z.infer<typeof opportunityRadarListQuerySchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateCompanyOpportunitySchema = z.object({
  status: companyOpportunityStatusSchema.optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  contactedAt: z.string().datetime().nullable().optional(),
  notes: optionalText(4_000),
  outcome: optionalText(2_000),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "At least one field is required",
});
export type UpdateCompanyOpportunityInput = z.infer<typeof updateCompanyOpportunitySchema>;
