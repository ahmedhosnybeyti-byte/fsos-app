import { Prisma } from "@field-sales-os/database";

// Prisma unique-constraint violations surface as a generic 500 unless mapped
// to a friendly 409 at the service boundary — this is the shared check every
// module's create/update methods use to do that.
export function isUniqueConstraintError(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.includes(field);
}
