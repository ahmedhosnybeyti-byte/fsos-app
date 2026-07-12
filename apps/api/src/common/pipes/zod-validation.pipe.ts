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
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
