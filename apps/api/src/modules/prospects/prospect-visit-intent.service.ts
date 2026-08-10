import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProspectVisitIntentInput, ProspectVisitIntentListQuery, UpdateProspectVisitIntentStatusInput } from "@field-sales-os/schemas";
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
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }], include: { prospect: true },
    });
  }

  async updateStatus(user: AuthenticatedUser, id: string, body: UpdateProspectVisitIntentStatusInput) {
    const intent = await this.prisma.prospectVisitIntent.findFirst({ where: { id, companyId: user.companyId! } });
    if (!intent) throw new NotFoundException();
    if (intent.assignedToUserId !== user.userId && !ASSIGNMENT_ROLES.has(user.roleCode)) throw new ForbiddenException();
    return this.prisma.prospectVisitIntent.update({ where: { id: intent.id }, data: { status: body.status } });
  }
}
