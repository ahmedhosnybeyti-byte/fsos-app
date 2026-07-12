import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient, Prisma } from "@field-sales-os/database";

// Accepted by service methods that must be composable inside a caller's
// prisma.$transaction(...) — pass the tx client through, or omit it to run
// standalone against the module-level PrismaService.
export type PrismaTx = PrismaService | Prisma.TransactionClient;

// Wraps the shared @field-sales-os/database PrismaClient in a NestJS-managed
// lifecycle (connect on boot, disconnect on shutdown) so it can be injected
// like any other provider and mocked in tests.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Connected to database");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
