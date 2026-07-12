import { z } from "zod";
import { GPT_DATASET_QUERY_LIMITS } from "./constants";

export const configureGptSchema = z.object({
  name: z.string().min(2).max(120),
});
export type ConfigureGptInput = z.infer<typeof configureGptSchema>;

// POST /gpt/verify-access — called by the Custom GPT's Action, authenticated
// with the company's static API key (Bearer) PLUS this one-time launch code
// pasted by the user inside the chat. Response includes the full list of the
// company's active datasets (see GptDatasetSummary) so the model knows
// everything available before the user even asks a question.
export const verifyGptAccessSchema = z.object({
  // TEMP: optional so the GPT Builder's connectivity test (which calls this
  // endpoint before a real code exists) doesn't fail schema validation.
  // Revert to required once the Action passes verification.
  launchCode: z.string().min(10).optional(),
});
export type VerifyGptAccessInput = z.infer<typeof verifyGptAccessSchema>;

// GET /gpt/dataset — subsequent Action calls, scoped by the session issued
// from verify-access. Fetches a FILTERED, PAGINATED slice of one dataset by
// id — never the whole file (that's what caused ChatGPT's
// ResponseTooLargeError before this existed). "type" alone can't identify
// which file to return since multiple active datasets can share the same
// datasetType; the model picks a fileId from the list verify-access (or
// GET /gpt/datasets) gave it.
//
// Column names vary per company's uploaded Excel (e.g. "CustomerCode" vs
// "Customer ID"), so there's no fixed schema to filter against. The named
// shortcuts (customerId/invoiceId/routeId/salesRep) are resolved at request
// time against that dataset's actual headers (see resolveColumnAlias in
// gpt.service.ts); `filters` is the general escape hatch for any other
// column, keyed by the real header name.
// {"op": "sum"|"count"|"avg"|"min"|"max", "column"?: string} — column
// required for every op except "count". Same "arrives as a JSON string"
// reasoning as `filters` below.
const aggregateSpecSchema = z
  .object({
    op: z.enum(["sum", "count", "avg", "min", "max"]),
    column: z.string().min(1).max(200).optional(),
  })
  .refine((v) => v.op === "count" || !!v.column, { message: 'column is required unless op is "count"' });
export type AggregateSpec = z.infer<typeof aggregateSpecSchema>;

// Sprint 2.3 — Rich Filter Operators. A filters value is either a plain
// string (exact match, unchanged since Sprint 1 — every existing call stays
// valid) or one of these operator objects for the same column. Multiple
// keys on one spec AND together (e.g. {"greaterThanOrEqual":100,"lessThan":500}
// is an inclusive/exclusive range) — same AND semantics filters already has
// across columns.
const filterOperatorSpecSchema = z
  .object({
    // Inclusive bounds, compared as dates — for the exact-value case on a
    // date column, use a plain string filter instead.
    dateFrom: z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateFrom must be a parseable date" }).optional(),
    dateTo: z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateTo must be a parseable date" }).optional(),
    greaterThan: z.number().optional(),
    greaterThanOrEqual: z.number().optional(),
    lessThan: z.number().optional(),
    lessThanOrEqual: z.number().optional(),
    // Inclusive [min, max] numeric range — shorthand for
    // greaterThanOrEqual+lessThanOrEqual on the same column.
    between: z
      .tuple([z.number(), z.number()])
      .refine(([min, max]) => min <= max, { message: "between requires [min, max] with min <= max" })
      .optional(),
    // Case-insensitive substring/prefix/suffix match.
    contains: z.string().min(1).optional(),
    startsWith: z.string().min(1).optional(),
    endsWith: z.string().min(1).optional(),
    // Case-insensitive membership — same match semantics as an exact-match
    // filters string, against any of these values.
    in: z.array(z.string().min(1)).min(1).max(50).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Provide at least one filter operator." });
export type FilterOperatorSpec = z.infer<typeof filterOperatorSpecSchema>;

const filterValueSchema = z.union([z.string().min(1), filterOperatorSpecSchema]);
export type FilterValue = z.infer<typeof filterValueSchema>;

export const getGptDatasetSchema = z
  .object({
    fileId: z.string().min(1),
    customerId: z.string().min(1).max(200).optional(),
    invoiceId: z.string().min(1).max(200).optional(),
    routeId: z.string().min(1).max(200).optional(),
    salesRep: z.string().min(1).max(200).optional(),
    // Free-text substring match across every column in a row.
    search: z.string().min(1).max(200).optional(),
    // JSON object string of column:value matches, e.g. {"Area":"North"} for
    // an exact match, or {"Amount":{"greaterThan":500}} for an operator —
    // query strings can't carry nested objects, so this arrives as text.
    filters: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (!raw) return undefined;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters must be a JSON object string, e.g. {"Area":"North"}' });
          return z.NEVER;
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filters must be a JSON object string, e.g. {"Area":"North"}' });
          return z.NEVER;
        }
        const result = z.record(z.string(), filterValueSchema).safeParse(parsed);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'filters values must be either an exact-match string or an operator object, e.g. {"Amount":{"greaterThan":500},"InvoiceDate":{"dateFrom":"2026-01-01","dateTo":"2026-03-31"},"Status":{"in":["Open","Pending"]}}',
          });
          return z.NEVER;
        }
        return result.data;
      }),
    // Computes an aggregate over the filtered rows server-side instead of
    // returning them — e.g. {"op":"sum","column":"Total"}. Requested by the
    // caller, never inferred: the backend still doesn't decide what a
    // number means, only how to add/count/average one when explicitly told.
    aggregate: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (!raw) return undefined;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'aggregate must be a JSON object string, e.g. {"op":"sum","column":"Total"}' });
          return z.NEVER;
        }
        const result = aggregateSpecSchema.safeParse(parsed);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'aggregate must be {"op":"sum"|"count"|"avg"|"min"|"max","column"?:string} — column required unless op is "count"',
          });
          return z.NEVER;
        }
        return result.data;
      }),
    // Groups the aggregate by this column's distinct values instead of
    // computing one overall figure. Only meaningful alongside `aggregate`.
    groupBy: z.string().min(1).max(200).optional(),
    // Sprint 2.4 — Column Projection. Comma-separated real column names,
    // e.g. columns=CustomerCode,CustomerName,Total. Only affects the `rows`
    // of a plain (non-aggregate) response; harmless to pass alongside
    // aggregate, where there's no row array to project.
    columns: z
      .string()
      .optional()
      .transform((raw) => {
        if (!raw) return undefined;
        const names = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return names.length > 0 ? names : undefined;
      }),
    // Sprint 2.4 — Server-side Sorting, executed before pagination. In rows
    // mode, a real column name. In aggregate+groupBy mode, one of
    // groupValue/value/rowCount (validated in GptService, since the valid
    // set depends on whether groupBy is set). Omit to keep existing
    // behavior exactly (file order for rows; value-descending for groups).
    sortBy: z.string().min(1).max(200).optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    limit: z.coerce.number().int().min(1).max(GPT_DATASET_QUERY_LIMITS.maxLimit).default(GPT_DATASET_QUERY_LIMITS.defaultLimit),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => !v.groupBy || v.aggregate, { message: "groupBy requires aggregate to also be set", path: ["groupBy"] })
  .refine((v) => v.sortBy || v.sortDir === "asc", { message: "sortDir requires sortBy to also be set", path: ["sortDir"] });
export type GetGptDatasetInput = z.infer<typeof getGptDatasetSchema>;
