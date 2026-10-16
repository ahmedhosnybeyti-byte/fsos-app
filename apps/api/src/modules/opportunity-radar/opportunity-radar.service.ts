import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type {
  OpportunityRadarListQuery,
  OpportunityRadarLocationsQuery,
  OpportunityTeamFollowUpQuery,
  OpportunityTeamFollowUpStatus,
  UpdateCompanyOpportunityInput,
  UpdateOpportunityRadarPreferenceInput,
} from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { geoAliases, groupGeoOptions } from "./opportunity-geo";

const COMPANY_WIDE_ROLES = new Set(["COMPANY_ADMIN", "MANAGER"]);
const ACTIONABLE_STATUSES = ["NEW", "REVIEWED", "CONTACTED", "QUALIFIED"] as const;
const TEAM_FOLLOW_UP_ROLES = new Set(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"]);

@Injectable()
export class OpportunityRadarService {
  constructor(private readonly prisma: PrismaService) {}

  async policy(user: AuthenticatedUser & { companyId: string }) {
    const policy = await this.prisma.opportunityRadarPolicy.findUnique({
      where: { companyId: user.companyId },
      select: { mode: true },
    });
    return { mode: policy?.mode ?? "STANDARD" };
  }

  async list(user: AuthenticatedUser & { companyId: string }, query: OpportunityRadarListQuery) {
    const [visibleUserIds, radarPolicy] = await Promise.all([
      this.visibleUserIds(user),
      this.prisma.opportunityRadarPolicy.findUnique({ where: { companyId: user.companyId }, select: { mode: true } }),
    ]);
    const eventFirst = radarPolicy?.mode === "EVENT_FIRST_WATER";
    const now = new Date();
    const purchaseActNowUntil = new Date(now.getTime() + 7 * 86_400_000);
    const eventOrOpeningActNowUntil = new Date(now.getTime() + 30 * 86_400_000);
    const eventRangeUntil = query.timeRange === "NEXT_30_DAYS"
      ? new Date(now.getTime() + 30 * 86_400_000)
      : query.timeRange === "NEXT_6_MONTHS"
        ? new Date(now.getTime() + 183 * 86_400_000)
        : query.timeRange === "NEXT_12_MONTHS"
          ? new Date(now.getTime() + 366 * 86_400_000)
          : null;
    const regionAliases = query.region ? geoAliases("region", query.region) : [];
    const cityAliases = query.city ? geoAliases("city", query.city) : [];
    const where: Prisma.CompanyOpportunityWhereInput = {
      companyId: user.companyId,
      ...this.visibilityWhere(user, visibleUserIds),
      AND: [
        query.visibility === "HIDDEN"
          ? { userPreferences: { some: { userId: user.userId, isHidden: true } } }
          : { userPreferences: { none: { userId: user.userId, isHidden: true } } },
        ...(query.favoriteOnly ? [{ userPreferences: { some: { userId: user.userId, isFavorite: true } } }] : []),
      ],
      ...(query.status ? { status: query.status } : {}),
      marketOpportunity: {
        reviewStatus: eventFirst ? { in: ["VERIFIED", "NEEDS_VERIFICATION"] } : "VERIFIED",
        ...(regionAliases.length ? { region: { in: regionAliases, mode: "insensitive" } } : {}),
        ...(cityAliases.length ? { city: { in: cityAliases, mode: "insensitive" } } : {}),
        ...(eventFirst && query.eventCategory ? { eventCategory: query.eventCategory } : {}),
        ...(query.type && query.view === "ALL" ? { opportunityType: query.type } : {}),
        ...(eventFirst && query.view === "ALL" && query.type === "EVENT" ? {
          status: "OPEN",
          opportunityDate: { gte: now, ...(eventRangeUntil ? { lte: eventRangeUntil } : {}) },
        } : {}),
        ...(query.view === "ACT_NOW" ? {
          status: "OPEN",
          OR: [
            { opportunityType: "PURCHASE", deadlineAt: { gte: now, lte: purchaseActNowUntil } },
            { opportunityType: "EVENT", opportunityDate: { gte: now, lte: eventOrOpeningActNowUntil } },
            // For PROACTIVE records, opportunityDate is reserved for a real
            // opening/operation date supplied by ingestion, not a generic
            // discovery or publication date.
            { opportunityType: "PROACTIVE", opportunityDate: { gte: now, lte: eventOrOpeningActNowUntil } },
          ],
        } : {}),
      },
      ...(query.view === "ACT_NOW" && !query.status ? { status: { in: [...ACTIONABLE_STATUSES] } } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.companyOpportunity.count({ where }),
      this.prisma.companyOpportunity.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: eventFirst && query.view === "ALL" && query.type === "EVENT" ? [
          { marketOpportunity: { priorityRank: "desc" } },
          { marketOpportunity: { contractingDeadlineAt: { sort: "asc", nulls: "last" } } },
          { marketOpportunity: { opportunityDate: { sort: "asc", nulls: "last" } } },
          { updatedAt: "desc" },
        ] : [{ marketOpportunity: { deadlineAt: { sort: "asc", nulls: "last" } } }, { updatedAt: "desc" }],
        select: {
          id: true,
          status: true,
          contactedAt: true,
          notes: true,
          outcome: true,
          updatedAt: true,
          userPreferences: {
            where: { userId: user.userId },
            select: { isFavorite: true, isHidden: true },
          },
          assignedTo: { select: { id: true, fullName: true, email: true } },
          assignedBy: { select: { id: true, fullName: true, email: true } },
          visitIntents: {
            where: { assignedToUserId: user.userId, status: "PLANNED" },
            take: 1,
            select: { scheduledFor: true },
          },
          marketOpportunity: {
            select: {
              id: true, vertical: true, opportunityType: true, title: true, organization: true,
              description: true, whyRelevant: true, country: true, region: true, city: true,
              location: true, publishedAt: true, opportunityDate: true, deadlineAt: true,
              eventCategory: true, venueName: true, venueAddress: true, locationKind: true,
              mapUrl: true, mapLinkKind: true, eventEndAt: true, dateLabel: true,
              contractingDeadlineAt: true, priorityRank: true, reviewStatus: true,
              reviewNote: true, waterDemandStatus: true, contactRole: true, nextAction: true,
              status: true, confidence: true, phone: true, whatsapp: true, email: true,
              contactUrl: true, sourceUrl: true, secondarySourceUrl: true, sourceName: true,
              lastVerifiedAt: true,
            },
          },
        },
      }),
    ]);
    return {
      items: items.map(({ userPreferences, visitIntents, ...item }) => ({
        ...item,
        isFavorite: userPreferences[0]?.isFavorite ?? false,
        isHidden: userPreferences[0]?.isHidden ?? false,
        scheduledVisitFor: visitIntents[0]?.scheduledFor ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listLocations(user: AuthenticatedUser & { companyId: string }, query: OpportunityRadarLocationsQuery) {
    const visibleUserIds = await this.visibleUserIds(user);
    const regionAliases = query.region ? geoAliases("region", query.region) : [];
    const visibleWhere = {
      reviewStatus: "VERIFIED" as const,
      ...(query.type ? { opportunityType: query.type } : {}),
      companyOpportunities: {
        some: { companyId: user.companyId, ...this.visibilityWhere(user, visibleUserIds) },
      },
    } satisfies Prisma.MarketOpportunityWhereInput;
    const [regionRows, cityRows, categoryRows] = await this.prisma.$transaction([
      this.prisma.marketOpportunity.groupBy({
        by: ["region"],
        where: visibleWhere,
        orderBy: { region: "asc" },
      }),
      this.prisma.marketOpportunity.groupBy({
        by: ["city"],
        where: {
          ...visibleWhere,
          ...(regionAliases.length ? { region: { in: regionAliases, mode: "insensitive" as const } } : {}),
        },
        orderBy: { city: "asc" },
      }),
      this.prisma.marketOpportunity.groupBy({
        by: ["eventCategory"],
        where: { ...visibleWhere, opportunityType: "EVENT", eventCategory: { not: null } },
        orderBy: { eventCategory: "asc" },
      }),
    ]);
    return {
      regions: groupGeoOptions("region", regionRows.map((row) => row.region)),
      cities: groupGeoOptions("city", cityRows.map((row) => row.city)),
      eventCategories: categoryRows.map((row) => row.eventCategory).filter((value): value is string => Boolean(value)),
    };
  }

  async listAssignees(user: AuthenticatedUser & { companyId: string }) {
    const visibleUserIds = await this.visibleUserIds(user);
    return this.prisma.user.findMany({
      where: { id: { in: visibleUserIds }, companyId: user.companyId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, role: { select: { code: true } } },
    });
  }

  async teamFollowUp(user: AuthenticatedUser & { companyId: string }, query: OpportunityTeamFollowUpQuery) {
    if (!TEAM_FOLLOW_UP_ROLES.has(user.roleCode)) throw new ForbiddenException("Team follow-up requires a management role");
    const visibleUserIds = await this.visibleUserIds(user);
    if (query.assignedToUserId && !visibleUserIds.includes(query.assignedToUserId)) {
      throw new ForbiddenException("Assignee is outside your organizational scope");
    }
    const visitDate = query.from || query.to ? {
      scheduledFor: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
      },
    } : null;
    const baseWhere: Prisma.CompanyOpportunityWhereInput = {
      companyId: user.companyId,
      assignedToUserId: { in: query.assignedToUserId ? [query.assignedToUserId] : visibleUserIds },
      ...(visitDate ? { visitIntents: { some: visitDate } } : {}),
    };
    const where: Prisma.CompanyOpportunityWhereInput = query.status
      ? { AND: [baseWhere, this.teamFollowUpStatusWhere(query.status)] }
      : baseWhere;
    const executedWhere: Prisma.CompanyOpportunityWhereInput = { ...baseWhere, visitIntents: { some: { ...(visitDate ?? {}), status: "COMPLETED" } } };
    const orderedWhere: Prisma.CompanyOpportunityWhereInput = {
      ...executedWhere,
      status: "WON",
      OR: [{ orderValue: { not: null } }, { orderQuantity: { not: null } }],
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, items, assigned, executed, ordered] = await this.prisma.$transaction([
      this.prisma.companyOpportunity.count({ where }),
      this.prisma.companyOpportunity.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, status: true, notes: true, outcome: true, orderValue: true, orderQuantity: true, updatedAt: true,
          assignedTo: { select: { id: true, fullName: true, email: true } },
          marketOpportunity: { select: { title: true, organization: true } },
          visitIntents: { take: 1, select: { id: true, scheduledFor: true, completedAt: true, status: true } },
        },
      }),
      this.prisma.companyOpportunity.count({ where: baseWhere }),
      this.prisma.companyOpportunity.count({ where: executedWhere }),
      this.prisma.companyOpportunity.count({ where: orderedWhere }),
    ]);
    return {
      items: items.map(({ visitIntents, ...item }) => {
        const visit = visitIntents[0] ?? null;
        return {
          ...item,
          visitDate: visit?.completedAt ?? visit?.scheduledFor ?? null,
          followUpStatus: this.resolveTeamFollowUpStatus(item.status, visit?.status, item.orderValue, item.orderQuantity),
        };
      }),
      summary: { assigned, executed, ordered },
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async update(user: AuthenticatedUser & { companyId: string }, id: string, input: UpdateCompanyOpportunityInput) {
    const visibleUserIds = await this.visibleUserIds(user);
    const existing = await this.prisma.companyOpportunity.findFirst({
      where: { id, companyId: user.companyId, ...this.visibilityWhere(user, visibleUserIds) },
      select: { id: true, assignedToUserId: true, contactedAt: true },
    });
    if (!existing) throw new NotFoundException("Opportunity was not found in your company scope");

    if (input.assignedToUserId !== undefined) {
      if (user.roleCode === "SALES_REP" && input.assignedToUserId !== user.userId) {
        throw new ForbiddenException("Sales representatives can assign an opportunity only to themselves");
      }
      if (input.assignedToUserId && !visibleUserIds.includes(input.assignedToUserId)) {
        throw new ForbiddenException("Assignee is outside your organizational scope");
      }
    }

    const assignmentChanged = input.assignedToUserId !== undefined && input.assignedToUserId !== existing.assignedToUserId;
    const updateOpportunity = (client: Pick<PrismaService, "companyOpportunity">) => client.companyOpportunity.update({
      where: { id: existing.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        ...(assignmentChanged ? {
          assignedByUserId: input.assignedToUserId ? user.userId : null,
          assignedAt: input.assignedToUserId ? new Date() : null,
        } : {}),
        ...(input.contactedAt !== undefined ? { contactedAt: input.contactedAt ? new Date(input.contactedAt) : null } : {}),
        ...(input.status === "CONTACTED" && input.contactedAt === undefined && !existing.contactedAt ? { contactedAt: new Date() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.outcome !== undefined ? { outcome: input.outcome || null } : {}),
      },
      select: {
        id: true, status: true, contactedAt: true, notes: true, outcome: true, updatedAt: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        assignedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!assignmentChanged) return updateOpportunity(this.prisma);
    return this.prisma.$transaction(async (transaction) => {
      if (existing.assignedToUserId) {
        await transaction.prospectVisitIntent.updateMany({
          where: {
            companyId: user.companyId,
            companyOpportunityId: existing.id,
            assignedToUserId: existing.assignedToUserId,
            status: "PLANNED",
          },
          data: { status: "CANCELLED" },
        });
      }
      return updateOpportunity(transaction as unknown as PrismaService);
    });
  }

  async updatePreference(
    user: AuthenticatedUser & { companyId: string },
    id: string,
    input: UpdateOpportunityRadarPreferenceInput,
  ) {
    const visibleUserIds = await this.visibleUserIds(user);
    const existing = await this.prisma.companyOpportunity.findFirst({
      where: { id, companyId: user.companyId, ...this.visibilityWhere(user, visibleUserIds) },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Opportunity was not found in your company scope");

    return this.prisma.opportunityRadarPreference.upsert({
      where: { userId_companyOpportunityId: { userId: user.userId, companyOpportunityId: existing.id } },
      create: {
        userId: user.userId,
        companyOpportunityId: existing.id,
        isFavorite: input.isFavorite ?? false,
        isHidden: input.isHidden ?? false,
      },
      update: {
        ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
        ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
      },
      select: { isFavorite: true, isHidden: true },
    });
  }

  private visibilityWhere(user: AuthenticatedUser, visibleUserIds: string[]): Prisma.CompanyOpportunityWhereInput {
    if (COMPANY_WIDE_ROLES.has(user.roleCode)) return {};
    if (user.roleCode === "SALES_REP") return { assignedToUserId: user.userId };
    return { OR: [{ assignedToUserId: null }, { assignedToUserId: { in: visibleUserIds } }] };
  }

  private teamFollowUpStatusWhere(status: OpportunityTeamFollowUpStatus): Prisma.CompanyOpportunityWhereInput {
    if (status === "ASSIGNED") return { visitIntents: { none: { status: { in: ["PLANNED", "COMPLETED"] } } } };
    if (status === "SCHEDULED") return { visitIntents: { some: { status: "PLANNED" } } };
    if (status === "VISITED") return { status: "CONTACTED", visitIntents: { some: { status: "COMPLETED" } } };
    if (status === "AGREED") return { status: "QUALIFIED", visitIntents: { some: { status: "COMPLETED" } } };
    if (status === "ORDERED") return { status: "WON", visitIntents: { some: { status: "COMPLETED" } }, OR: [{ orderValue: { not: null } }, { orderQuantity: { not: null } }] };
    return { status: "LOST", visitIntents: { some: { status: "COMPLETED" } } };
  }

  private resolveTeamFollowUpStatus(
    status: string,
    visitStatus: string | undefined,
    orderValue: unknown,
    orderQuantity: unknown,
  ): OpportunityTeamFollowUpStatus {
    if (status === "LOST" && visitStatus === "COMPLETED") return "UNSUCCESSFUL";
    if (status === "WON" && visitStatus === "COMPLETED" && (orderValue !== null || orderQuantity !== null)) return "ORDERED";
    if (status === "QUALIFIED" && visitStatus === "COMPLETED") return "AGREED";
    if (status === "CONTACTED" && visitStatus === "COMPLETED") return "VISITED";
    if (visitStatus === "PLANNED") return "SCHEDULED";
    return "ASSIGNED";
  }

  private async visibleUserIds(user: AuthenticatedUser & { companyId: string }): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { companyId: user.companyId, status: { not: "ARCHIVED" } },
      select: { id: true, employee: { select: { id: true, managerId: true } } },
    });
    if (COMPANY_WIDE_ROLES.has(user.roleCode)) return users.map((row) => row.id);
    const ownEmployee = users.find((row) => row.id === user.userId)?.employee;
    if (!ownEmployee) return [user.userId];
    const userByEmployeeId = new Map(users.flatMap((row) => row.employee ? [[row.employee.id, row.id] as const] : []));
    const employeeChildren = new Map<string, string[]>();
    for (const row of users) {
      if (!row.employee?.managerId) continue;
      employeeChildren.set(row.employee.managerId, [...(employeeChildren.get(row.employee.managerId) ?? []), row.employee.id]);
    }
    const visible = new Set<string>([user.userId]);
    const queue = [ownEmployee.id];
    while (queue.length) {
      const managerEmployeeId = queue.shift()!;
      for (const childEmployeeId of employeeChildren.get(managerEmployeeId) ?? []) {
        const childUserId = userByEmployeeId.get(childEmployeeId);
        if (childUserId) visible.add(childUserId);
        queue.push(childEmployeeId);
      }
    }
    return [...visible];
  }
}
