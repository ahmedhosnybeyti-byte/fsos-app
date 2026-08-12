import { z } from "zod";
import { PASSWORD_POLICY } from "./constants";
import { roleCodeSchema } from "./enums";

// Loose on purpose — this only needs to be "clearly a phone/WhatsApp
// number", not validated against a specific country format. Accepts
// digits, spaces, +, -, () with a sane overall length.
const whatsappSchema = z
  .string()
  .trim()
  .min(6, "رقم واتساب غير صالح")
  .max(20, "رقم واتساب غير صالح")
  .regex(/^[0-9+\-() ]+$/, "رقم واتساب غير صالح");

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, `Password must be at least ${PASSWORD_POLICY.minLength} characters`)
  .refine((v) => !PASSWORD_POLICY.requireUppercase || /[A-Z]/.test(v), {
    message: "Password must contain an uppercase letter",
  })
  .refine((v) => !PASSWORD_POLICY.requireLowercase || /[a-z]/.test(v), {
    message: "Password must contain a lowercase letter",
  })
  .refine((v) => !PASSWORD_POLICY.requireNumber || /[0-9]/.test(v), {
    message: "Password must contain a number",
  })
  .refine((v) => !PASSWORD_POLICY.requireSpecialChar || /[^A-Za-z0-9]/.test(v), {
    message: "Password must contain a special character",
  });

// Registration always creates a new Company + its first COMPANY_ADMIN user —
// the platform never lets a self-serve signup pick a role for themselves.
export const trialCountrySchema = z.enum(["EGYPT", "SAUDI_ARABIA"]);
export type TrialCountry = z.infer<typeof trialCountrySchema>;

export const trialRoleSchema = roleCodeSchema.extract(["COMPANY_ADMIN", "SALES_REP"]);
export type TrialRole = z.infer<typeof trialRoleSchema>;
export const trialChannelSchema = z.enum(["CASH_VAN", "HORECA"]);
export const trialAreaSchema = z.enum(["ALEXANDRIA", "SHARQIA"]);

export const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  whatsapp: whatsappSchema,
  country: trialCountrySchema,
  trialRole: trialRoleSchema,
  trialChannel: trialChannelSchema.optional(),
  trialArea: trialAreaSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.trialRole !== "SALES_REP") return;
  if (!value.trialChannel) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trialChannel"], message: "Channel is required for Sales Rep" });
  if (value.country === "EGYPT" && !value.trialArea) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trialArea"], message: "Area is required for Egypt Sales Rep" });
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmNewPassword: z.string().min(1),
}).refine((values) => values.newPassword === values.confirmNewPassword, {
  message: "Passwords do not match",
  path: ["confirmNewPassword"],
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().trim().email().toLowerCase(),
  confirmEmail: z.string().trim().email().toLowerCase(),
}).refine((values) => values.newEmail === values.confirmEmail, {
  message: "Email addresses do not match",
  path: ["confirmEmail"],
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
