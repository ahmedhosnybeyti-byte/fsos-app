import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Singleton guard so scripts / hot-reloaded dev processes don't open a new
// connection pool on every import. apps/api wraps PrismaClient in its own
// NestJS-managed PrismaService instead of using this singleton directly.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
