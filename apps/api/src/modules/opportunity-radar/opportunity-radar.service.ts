import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type {
  OpportunityRadarListQuery,
  OpportunityRadarLocationsQuery,
  UpdateCompanyOpportunityInput,
  UpdateOpportunityRadarPreferenceInput,
} from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { geoAliases, groupGeoOptions } from "./opportunity-geo";

const COMPANY_WIDE_ROLES = new Set(["COMPANY_ADMIN", "MANAGER"]);
const ACTIONABLE_STATUSES = ["NEW", "REVIEWED", "CONTACTED", "QUALIFIED"] as const;

@Injectable()
export class OpportunityRadarService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser & { companyId: string }, query: OpportunityRadarListQuery) {
    const visibleUserIds = await this.visibleUserIds(user);
    const now = new Date();
    const purchaseActNowUntil = new Date(now.getTime() + 7 * 86_400_000);
    const eventOrOpeningActNowUntil = new Date(now.getTime() + 30 * 86_400_000);
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
        ...(regionAliases.length ? { region: { in: regionAliases, mode: "insensitive" } } : {}),
        ...(cityAliases.length ? { city: { in: cityAliases, mode: "insensitive" } } : {}),
        ...(query.type && query.view === "ALL" ? { opportunityType: query.type } : {}),
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
        orderBy: [{ marketOpportunity: { deadlineAt: { sort: "asc", nulls: "last" } } }, { updatedAt: "desc" }],
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
          marketOpportunity: {
            select: {
              id: true, vertical: true, opportunityType: true, title: true, organization: true,
              description: true, whyRelevant: true, country: true, region: true, city: true,
              location: true, publishedAt: true, opportunityDate: true, deadlineAt: true,
              status: true, confidence: true, phone: true, whatsapp: true, email: true,
              contactUrl: true, sourceUrl: true, secondarySourceUrl: true, sourceName: true,
              lastVerifiedAt: true,
            },
          },
        },
      }),
    ]);
    return {
      items: items.map(({ userPreferences, ...item }) => ({
        ...item,
        isFavorite: userPreferences[0]?.isFavorite ?? false,
        isHidden: userPreferences[0]?.isHidden ?? false,
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
      companyOpportunities: {
        some: { companyId: user.companyId, ...this.visibilityWhere(user, visibleUserIds) },
      },
    } satisfies Prisma.MarketOpportunityWhereInput;
    const [regionRows, cityRows] = await this.prisma.$transaction([
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
    ]);
    return {
      regions: groupGeoOptions("region", regionRows.map((row) => row.region)),
      cities: groupGeoOptions("city", cityRows.map((row) => row.city)),
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

    return this.prisma.companyOpportunity.update({
      where: { id: existing.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        ...(input.contactedAt !== undefined ? { contactedAt: input.contactedAt ? new Date(input.contactedAt) : null } : {}),
        ...(input.status === "CONTACTED" && input.contactedAt === undefined && !existing.contactedAt ? { contactedAt: new Date() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.outcome !== undefined ? { outcome: input.outcome || null } : {}),
      },
      select: { id: true, status: true, contactedAt: true, notes: true, outcome: true, updatedAt: true, assignedTo: { select: { id: true, fullName: true, email: true } } },
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
