import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProspectVisitIntentInput, ProspectVisitIntentListQuery, RadarOpportunityVisitResultInput, UpdateProspectVisitIntentStatusInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const ASSIGNMENT_ROLES = new Set(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"]);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

@Injectable()
export class ProspectVisitIntentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, body: CreateProspectVisitIntentInput) {
    const companyId = user.companyId!;
    const assignedToUserId = body.assignedToUserId ?? user.userId;
    if (assignedToUserId !== user.userId && !ASSIGNMENT_ROLES.has(user.roleCode)) throw new ForbiddenException();

    if (body.companyOpportunityId) {
      // Radar opportunities are scheduled by their current assignee. This
      // keeps a manager's assignment boundary in Opportunity Radar and
      // prevents this shared scheduling endpoint from bypassing hierarchy.
      if (assignedToUserId !== user.userId) throw new ForbiddenException("Radar opportunities can be scheduled only by their assignee");
      const opportunity = await this.prisma.companyOpportunity.findFirst({
        where: { id: body.companyOpportunityId, companyId, assignedToUserId: user.userId },
        select: { id: true },
      });
      if (!opportunity) throw new NotFoundException();
      const scheduledFor = asDate(body.scheduledFor);
      return this.prisma.prospectVisitIntent.upsert({
        where: { companyOpportunityId: opportunity.id },
        create: {
          companyId,
          companyOpportunityId: opportunity.id,
          assignedToUserId: user.userId,
          scheduledFor,
          createdByUserId: user.userId,
        },
        update: { assignedToUserId: user.userId, scheduledFor, status: "PLANNED", completedAt: null, createdByUserId: user.userId },
      });
    }

    if (!body.prospectId) throw new NotFoundException();
    const [prospect, assignee] = await Promise.all([
      this.prisma.prospect.findFirst({ where: { id: body.prospectId, companyId }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { id: assignedToUserId, companyId, status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!prospect || !assignee) throw new NotFoundException();
    const scheduledFor = asDate(body.scheduledFor);
    return this.prisma.prospectVisitIntent.upsert({
      where: { prospectId_assignedToUserId_scheduledFor: { prospectId: prospect.id, assignedToUserId: assignee.id, scheduledFor } },
      create: { companyId, prospectId: prospect.id, assignedToUserId: assignee.id, scheduledFor, createdByUserId: user.userId },
      update: { status: "PLANNED" },
    });
  }

  async list(user: AuthenticatedUser, query: ProspectVisitIntentListQuery) {
    const manages = ASSIGNMENT_ROLES.has(user.roleCode);
    return this.prisma.prospectVisitIntent.findMany({
      where: { companyId: user.companyId!, ...(manages ? {} : { assignedToUserId: user.userId }), ...(query.scheduledFor ? { scheduledFor: asDate(query.scheduledFor) } : {}) },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      include: { prospect: true, companyOpportunity: { include: { marketOpportunity: true } } },
    });
  }

  async updateStatus(user: AuthenticatedUser, id: string, body: UpdateProspectVisitIntentStatusInput) {
    const intent = await this.prisma.prospectVisitIntent.findFirst({ where: { id, companyId: user.companyId! } });
    if (!intent) throw new NotFoundException();
    if (intent.assignedToUserId !== user.userId && !ASSIGNMENT_ROLES.has(user.roleCode)) throw new ForbiddenException();
    return this.prisma.prospectVisitIntent.update({ where: { id: intent.id }, data: { status: body.status } });
  }

  async recordRadarResult(user: AuthenticatedUser, id: string, body: RadarOpportunityVisitResultInput) {
    if (body.result === "ORDERED" && body.orderValue == null && body.orderQuantity == null) {
      throw new BadRequestException("A confirmed order requires an order value or quantity");
    }
    const intent = await this.prisma.prospectVisitIntent.findFirst({
      where: {
        id,
        companyId: user.companyId!,
        assignedToUserId: user.userId,
        companyOpportunity: { is: { companyId: user.companyId!, assignedToUserId: user.userId } },
      },
      select: { id: true, companyOpportunityId: true },
    });
    if (!intent?.companyOpportunityId) throw new NotFoundException();
    const status = body.result === "VISITED" ? "CONTACTED"
      : body.result === "AGREED" ? "QUALIFIED"
        : body.result === "ORDERED" ? "WON"
          : "LOST";
    const completedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.prospectVisitIntent.update({
        where: { id: intent.id },
        data: { status: "COMPLETED", completedAt },
      });
      return transaction.companyOpportunity.update({
        where: { id: intent.companyOpportunityId! },
        data: {
          status,
          contactedAt: completedAt,
          outcome: body.outcome || null,
          notes: body.notes || null,
          orderValue: body.result === "ORDERED" ? body.orderValue ?? null : null,
          orderQuantity: body.result === "ORDERED" ? body.orderQuantity ?? null : null,
        },
      });
    });
  }
}
