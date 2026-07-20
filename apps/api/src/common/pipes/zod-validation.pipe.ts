import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

// Single validation entry point for both request bodies and query params,
// backed by the same Zod schemas the frontend uses (packages/schemas) — one
// source of truth, no duplicated validation logic.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const flattened = result.error.flatten();
      // Surface the actual field(s) and reason in the top-level message —
      // "Validation failed" alone forced every caller to dig into dev tools
      // to find out what was actually wrong (see PROJECT_LOG.md).
      const fieldMessages = Object.entries(flattened.fieldErrors).map(([field, msgs]) => `${field}: ${(msgs ?? []).join("; ")}`);
      const summary = fieldMessages.length > 0 ? fieldMessages.join(" | ") : flattened.formErrors.join("; ") || "Validation failed";
      throw new BadRequestException({
        message: summary,
        errors: flattened,
      });
    }
    return result.data;
  }
}
