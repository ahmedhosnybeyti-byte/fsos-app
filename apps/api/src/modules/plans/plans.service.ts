import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { CreatePlanInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  findByCode(code: string) {
    return this.prisma.plan.findUnique({ where: { code } });
  }

  async findByCodeOrThrow(code: string) {
    const plan = await this.findByCode(code);
    if (!plan) throw new NotFoundException(`Plan "${code}" not found`);
    return plan;
  }

  listActive() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } });
  }

  listAll() {
    return this.prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
  }

  async create(dto: CreatePlanInput) {
    try {
      return await this.prisma.plan.create({
        data: {
          code: dto.code,
          name: dto.name,
          priceCents: dto.priceCents,
          currency: dto.currency,
          billingInterval: dto.billingIntervalCode,
          maxUsers: dto.maxUsers ?? null,
          features: dto.features as Prisma.InputJsonValue,
          isActive: dto.isActive,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "code")) {
        throw new ConflictException(`Plan code "${dto.code}" already exists`);
      }
      throw err;
    }
  }

  update(id: string, dto: Partial<CreatePlanInput>) {
    return this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name,
        priceCents: dto.priceCents,
        currency: dto.currency,
        billingInterval: dto.billingIntervalCode,
        maxUsers: dto.maxUsers,
        features: dto.features as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
    });
  }
}
