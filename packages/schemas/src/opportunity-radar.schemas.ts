import { z } from "zod";

export const MARKET_OPPORTUNITY_TYPES = ["PURCHASE", "EVENT", "PROACTIVE"] as const;
export const marketOpportunityTypeSchema = z.enum(MARKET_OPPORTUNITY_TYPES);
export type MarketOpportunityType = z.infer<typeof marketOpportunityTypeSchema>;

export const COMPANY_OPPORTUNITY_STATUSES = ["NEW", "REVIEWED", "CONTACTED", "QUALIFIED", "WON", "LOST", "EXPIRED"] as const;
export const companyOpportunityStatusSchema = z.enum(COMPANY_OPPORTUNITY_STATUSES);
export type CompanyOpportunityStatus = z.infer<typeof companyOpportunityStatusSchema>;

export const OPPORTUNITY_TIME_RANGES = ["ALL_FUTURE", "NEXT_30_DAYS", "NEXT_6_MONTHS", "NEXT_12_MONTHS"] as const;
export const opportunityTimeRangeSchema = z.enum(OPPORTUNITY_TIME_RANGES);
export type OpportunityTimeRange = z.infer<typeof opportunityTimeRangeSchema>;

export const OPPORTUNITY_TIME_BUCKETS = ["NEXT_30_DAYS", "DAYS_31_TO_183", "DAYS_184_TO_366", "AFTER_12_MONTHS"] as const;
export const opportunityTimeBucketSchema = z.enum(OPPORTUNITY_TIME_BUCKETS);
export type OpportunityTimeBucket = z.infer<typeof opportunityTimeBucketSchema>;

export const OPPORTUNITY_DATA_QUALITIES = ["VERIFIED", "NEEDS_VERIFICATION"] as const;
export const opportunityDataQualitySchema = z.enum(OPPORTUNITY_DATA_QUALITIES);
export type OpportunityDataQuality = z.infer<typeof opportunityDataQualitySchema>;

const queryArray = <T extends z.ZodTypeAny>(item: T, max = 50) => z.preprocess(
  (value) => value === undefined ? undefined : (Array.isArray(value) ? value : [value]),
  z.array(item).min(1).max(max).optional(),
);

const queryBoolean = z.union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const opportunityRadarListQuerySchema = z.object({
  type: marketOpportunityTypeSchema.optional(),
  view: z.enum(["ALL", "ACT_NOW"]).default("ALL"),
  status: companyOpportunityStatusSchema.optional(),
  regions: queryArray(z.string().trim().min(1).max(512)),
  cities: queryArray(z.string().trim().min(1).max(512)),
  eventCategories: queryArray(z.string().trim().min(1).max(200)),
  timeRanges: queryArray(opportunityTimeBucketSchema, OPPORTUNITY_TIME_BUCKETS.length),
  dataQualities: queryArray(opportunityDataQualitySchema, OPPORTUNITY_DATA_QUALITIES.length),
  // Kept for older clients during the rollout. New UI uses the disjoint timeRanges buckets.
  timeRange: opportunityTimeRangeSchema.optional(),
  favoriteOnly: queryBoolean.default(false),
  visibility: z.enum(["VISIBLE", "HIDDEN"]).default("VISIBLE"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type OpportunityRadarListQuery = z.infer<typeof opportunityRadarListQuerySchema>;

export const opportunityRadarLocationsQuerySchema = z.object({
  regions: queryArray(z.string().trim().min(1).max(512)),
  type: marketOpportunityTypeSchema.optional(),
});
export type OpportunityRadarLocationsQuery = z.infer<typeof opportunityRadarLocationsQuerySchema>;

export const OPPORTUNITY_TEAM_FOLLOW_UP_STATUSES = ["ASSIGNED", "SCHEDULED", "VISITED", "AGREED", "ORDERED", "UNSUCCESSFUL"] as const;
export const opportunityTeamFollowUpStatusSchema = z.enum(OPPORTUNITY_TEAM_FOLLOW_UP_STATUSES);
export type OpportunityTeamFollowUpStatus = z.infer<typeof opportunityTeamFollowUpStatusSchema>;
export const opportunityTeamFollowUpQuerySchema = z.object({
  assignedToUserId: z.string().trim().min(1).max(200).optional(),
  status: opportunityTeamFollowUpStatusSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "from must not be after to",
  path: ["from"],
});
export type OpportunityTeamFollowUpQuery = z.infer<typeof opportunityTeamFollowUpQuerySchema>;

export const updateOpportunityRadarPreferenceSchema = z.object({
  isFavorite: z.boolean().optional(),
  isHidden: z.boolean().optional(),
}).refine((value) => value.isFavorite !== undefined || value.isHidden !== undefined, {
  message: "At least one preference is required",
});
export type UpdateOpportunityRadarPreferenceInput = z.infer<typeof updateOpportunityRadarPreferenceSchema>;

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
