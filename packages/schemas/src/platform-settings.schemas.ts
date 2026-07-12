import { z } from "zod";

// Platform-wide trial policy — SUPER_ADMIN configurable, never hardcoded.
// All fields optional so PATCH can update a subset.
export const updatePlatformSettingsSchema = z.object({
  trialEnabled: z.boolean().optional(),
  trialDurationDays: z.number().int().min(1).max(365).optional(),
  defaultPlanCode: z.string().min(1).max(40).optional(),
  autoStartTrialOnRegistration: z.boolean().optional(),
  // Base URL of the platform's one Custom GPT — what "Open Custom GPT"
  // opens after a launch code is minted. Never a conversation URL (/c/...).
  gptBaseUrl: z.string().url().optional(),
});
export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
