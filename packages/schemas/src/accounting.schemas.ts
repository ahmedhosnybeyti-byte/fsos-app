import { z } from "zod";

export const accountingPermissions = ["accounting.read", "accounting.accounts.manage", "accounting.journal.post", "accounting.journal.reverse", "accounting.period.close"] as const;
export const accountingAccountTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Invalid date");
// Money crosses HTTP as strings. Reject fractions of a halala rather than round.
export const accountingAmountSchema = z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/).transform(v => {
  const [whole, fraction = ""] = v.split("."); return `${whole}.${fraction.padEnd(2,"0")}`;
});
export const accountingAccountSchema = z.object({ code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/), name: text(160), type: z.enum(accountingAccountTypes) }).strict();
export const accountingPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), search: z.string().trim().max(80).default("") }).strict();
export const accountingJournalQuerySchema = accountingPageSchema.extend({ from: date.optional(), to: date.optional() }).refine(v => !v.from || !v.to || v.from <= v.to, "Invalid date range");
export const accountingTrialQuerySchema = accountingPageSchema.extend({ asOf: date });
export const accountingLineSchema = z.object({ accountCode: accountingAccountSchema.shape.code, debit: accountingAmountSchema.default("0"), credit: accountingAmountSchema.default("0"), memo: z.string().trim().max(200).default("") }).strict();
const command = { idempotencyKey: z.string().uuid(), date, reason: z.string().trim().min(3).max(300) };
export const accountingPostSchema = z.object({ ...command, reference: text(80).refine(v => !v.startsWith("REV:"), "Reserved reference"), lines: z.array(accountingLineSchema).min(2).max(100) }).strict();
export const accountingReverseSchema = z.object(command).strict();
export const accountingCloseSchema = z.object({ through: date, reason: command.reason }).strict();
export type AccountingPost = z.input<typeof accountingPostSchema>;
export type AccountingReverse = z.input<typeof accountingReverseSchema>;
export interface AccountingAccount { code: string; name: string; type: typeof accountingAccountTypes[number] }
export interface AccountingLine { accountCode: string; accountName: string; debit: string; credit: string; memo: string }
export interface AccountingJournal { id: string; date: string; reference: string; reason: string; kind: "MANUAL" | "REVERSAL" | "CORRECTION"; reversalOf: string | null; correctionOf: string | null; reversed: boolean; actorId: string; createdAt: string; debit: string; credit: string }
export interface AccountingTrialRow extends AccountingAccount { debit: string; credit: string; balanceDebit: string; balanceCredit: string }
export interface AccountingPage<T> { items: T[]; page: number; hasMore: boolean }
export interface AccountingTrial extends AccountingPage<AccountingTrialRow> { asOf: string; totals: { debit: string; credit: string; balanceDebit: string; balanceCredit: string } }
export interface AccountingResult { journalId: string; reversalId?: string }
export interface AccountingBook { currency: "SAR"; closedThrough: string | null }
